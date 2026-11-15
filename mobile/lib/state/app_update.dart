import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../config.dart';

/// What `GET /downloads/latest.json` says is the newest Android build.
class AppUpdate {
  AppUpdate({required this.version, required this.build, required this.file, required this.size, this.sha256 = ''});

  final String version;
  final int? build; // older latest.json files have no build number
  final String file;
  final int size;
  final String sha256; // hex digest of the APK, '' when the server did not publish one

  factory AppUpdate.fromJson(Map<String, dynamic> j) => AppUpdate(
        version: '${j['version'] ?? ''}',
        build: j['build'] is num ? (j['build'] as num).toInt() : int.tryParse('${j['build'] ?? ''}'),
        file: '${j['file'] ?? ''}',
        size: j['size'] is num ? (j['size'] as num).toInt() : 0,
        sha256: '${j['sha256'] ?? ''}'.trim().toLowerCase(),
      );

  /// Same file-name rule the server enforces in `src/app/downloads/[name]/route.ts`.
  static final _fileOk = RegExp(r'^cheapbazar-[0-9][0-9A-Za-z.\-]{0,30}\.apk$');
  bool get hasValidFile => _fileOk.hasMatch(file);

  /// Empty is allowed (older latest.json); anything else must be a real SHA-256 hex digest.
  bool get hasValidSha => sha256.isEmpty || RegExp(r'^[0-9a-f]{64}$').hasMatch(sha256);

  Uri downloadUri(String baseUrl) => Uri.parse('${baseUrl.replaceAll(RegExp(r'/+$'), '')}/downloads/$file');
}

List<int> _parts(String v) => v.split('.').map((p) => int.tryParse(p.replaceAll(RegExp(r'[^0-9].*$'), '')) ?? 0).toList();

/// True when [remote] is a newer release than what is installed.
/// Compares `1.2.3` style versions first; if they are equal, compares the build number (when both are known).
bool isNewerVersion({
  required String installedVersion,
  required int installedBuild,
  required String remoteVersion,
  required int? remoteBuild,
}) {
  final a = _parts(installedVersion), b = _parts(remoteVersion);
  for (var i = 0; i < 3; i++) {
    final x = i < a.length ? a[i] : 0, y = i < b.length ? b[i] : 0;
    if (y != x) return y > x;
  }
  return remoteBuild != null && remoteBuild > installedBuild;
}

/// Returns the available update, or null when this install is already the latest.
/// Throws on network/format problems so the UI can say "could not check".
Future<AppUpdate?> checkForUpdate(http.Client client, String baseUrl) async {
  final res = await client
      .get(Uri.parse('${baseUrl.replaceAll(RegExp(r'/+$'), '')}/downloads/latest.json'), headers: {'cache-control': 'no-cache'})
      .timeout(const Duration(seconds: 15));
  if (res.statusCode == 404) return null; // nothing published yet
  if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
  final json = jsonDecode(utf8.decode(res.bodyBytes));
  if (json is! Map<String, dynamic>) throw const FormatException('bad latest.json');
  final u = AppUpdate.fromJson(json);
  if (!u.hasValidFile) throw const FormatException('bad file name');
  if (!u.hasValidSha) throw const FormatException('bad checksum');
  return isNewerVersion(
    installedVersion: AppConfig.version,
    installedBuild: AppConfig.build,
    remoteVersion: u.version,
    remoteBuild: u.build,
  )
      ? u
      : null;
}


// ---------------------------------------------------------------- download + install

/// Thrown when the shopper presses Cancel while the APK is downloading.
class UpdateCancelled implements Exception {
  const UpdateCancelled();
}

/// The bytes that arrived are not the file the server announced (short, damaged or swapped).
class UpdateIntegrityError implements Exception {
  UpdateIntegrityError(this.reason);
  final String reason;
  @override
  String toString() => 'UpdateIntegrityError: $reason';
}

class UpdateCancelToken {
  bool _cancelled = false;
  bool get cancelled => _cancelled;
  void cancel() => _cancelled = true;
}

typedef UpdateDirProvider = Future<Directory> Function();

/// Downloads the published APK into the app's private storage and proves it is the announced file
/// (size + SHA-256) before anyone is asked to install it. Android itself still refuses an APK that is
/// not signed with the same key as the installed app, so a tampered file could never replace the app.
class UpdateDownloader {
  UpdateDownloader({http.Client? client, UpdateDirProvider? dir}) : _client = client ?? http.Client(), _dir = dir ?? _defaultDir;
  final http.Client _client;
  final UpdateDirProvider _dir;

  static Future<Directory> _defaultDir() async {
    final base = await getApplicationSupportDirectory(); // inside the app's data dir: no storage permission needed
    return Directory('${base.path}/updates').create(recursive: true);
  }

  static Future<String> _sha256Of(File f) async => (await sha256.bind(f.openRead()).first).toString();

  Future<File> download(
    AppUpdate u,
    String baseUrl, {
    void Function(int received, int total)? onProgress,
    UpdateCancelToken? cancel,
  }) async {
    final dir = await _dir();
    final target = File('${dir.path}/${u.file}');
    final part = File('${target.path}.part');

    // An earlier, fully verified download of this very version: reuse it (no second 50 MB download).
    if (await target.exists()) {
      final len = await target.length();
      final shaOk = u.sha256.isEmpty || await _sha256Of(target) == u.sha256;
      if ((u.size == 0 || len == u.size) && shaOk) {
        onProgress?.call(len, len);
        return target;
      }
    }
    // Anything else left over from older versions or failed attempts is dead weight.
    for (final e in dir.listSync()) {
      if (e is File && e.path.split('/').last.startsWith('cheapbazar-')) {
        try {
          e.deleteSync();
        } catch (_) {}
      }
    }

    final res = await _client.send(http.Request('GET', u.downloadUri(baseUrl))).timeout(const Duration(seconds: 20));
    if (res.statusCode != 200) throw HttpException('HTTP ${res.statusCode}');
    final total = res.contentLength ?? (u.size > 0 ? u.size : 0);

    final sink = part.openWrite();
    var received = 0;
    try {
      // `timeout` here is per chunk: a stalled connection fails instead of hanging the dialog forever.
      await for (final chunk in res.stream.timeout(const Duration(seconds: 30))) {
        if (cancel?.cancelled == true) throw const UpdateCancelled();
        sink.add(chunk);
        received += chunk.length;
        onProgress?.call(received, total);
      }
      await sink.flush();
      await sink.close();
    } catch (_) {
      try {
        await sink.close();
      } catch (_) {}
      if (await part.exists()) await part.delete();
      rethrow;
    }

    if (u.size > 0 && received != u.size) {
      await part.delete();
      throw UpdateIntegrityError('expected ${u.size} bytes, got $received');
    }
    if (u.sha256.isNotEmpty && await _sha256Of(part) != u.sha256) {
      await part.delete();
      throw UpdateIntegrityError('checksum mismatch');
    }
    if (await target.exists()) await target.delete();
    return part.rename(target.path);
  }
}

enum InstallOutcome { started, needsPermission, failed }

typedef ApkInstaller = Future<InstallOutcome> Function(File apk);

/// Hands the verified APK to Android's package installer (a FileProvider URI, so no storage permission).
/// Android shows its own "Install?" screen; if installs from this app are not allowed yet it sends the
/// shopper to the right settings page first, and they tap Install again afterwards.
Future<InstallOutcome> installWithAndroid(File apk) async {
  final r = await OpenFilex.open(apk.path, type: 'application/vnd.android.package-archive');
  switch (r.type) {
    case ResultType.done:
      return InstallOutcome.started;
    case ResultType.permissionDenied:
      return InstallOutcome.needsPermission;
    default:
      return InstallOutcome.failed;
  }
}
