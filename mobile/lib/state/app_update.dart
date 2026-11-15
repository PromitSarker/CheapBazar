import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';

/// What `GET /downloads/latest.json` says is the newest Android build.
class AppUpdate {
  AppUpdate({required this.version, required this.build, required this.file, required this.size});

  final String version;
  final int? build; // older latest.json files have no build number
  final String file;
  final int size;

  factory AppUpdate.fromJson(Map<String, dynamic> j) => AppUpdate(
        version: '${j['version'] ?? ''}',
        build: j['build'] is num ? (j['build'] as num).toInt() : int.tryParse('${j['build'] ?? ''}'),
        file: '${j['file'] ?? ''}',
        size: j['size'] is num ? (j['size'] as num).toInt() : 0,
      );

  /// Same file-name rule the server enforces in `src/app/downloads/[name]/route.ts`.
  static final _fileOk = RegExp(r'^cheapbazar-[0-9][0-9A-Za-z.\-]{0,30}\.apk$');
  bool get hasValidFile => _fileOk.hasMatch(file);

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
  return isNewerVersion(
    installedVersion: AppConfig.version,
    installedBuild: AppConfig.build,
    remoteVersion: u.version,
    remoteBuild: u.build,
  )
      ? u
      : null;
}
