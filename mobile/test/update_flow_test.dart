import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cheapbazar/api/api_client.dart';
import 'package:cheapbazar/state/app_update.dart';
import 'package:cheapbazar/state/l10n.dart';
import 'package:cheapbazar/ui/widgets/update_tile.dart';

final bytes = List<int>.generate(300 * 1024, (i) => (i * 31 + 7) % 251); // ~300 KB of non-trivial data
final goodSha = sha256.convert(bytes).toString();

AppUpdate update({String? sha, int? size, String file = 'cheapbazar-9.0.0-5.apk'}) =>
    AppUpdate(version: '9.0.0', build: 5, file: file, size: size ?? bytes.length, sha256: sha ?? goodSha);

/// A client that streams [data] in 64 KB chunks, counting requests.
class Server {
  Server({this.data, this.status = 200});
  final List<int>? data;
  final int status;
  int requests = 0;
  late final http.Client client = MockClient.streaming((req, _) async {
    requests++;
    final d = data ?? bytes;
    Stream<List<int>> body() async* {
      for (var i = 0; i < d.length; i += 64 * 1024) {
        await Future<void>.delayed(Duration.zero);
        yield d.sublist(i, i + 64 * 1024 > d.length ? d.length : i + 64 * 1024);
      }
    }
    return http.StreamedResponse(body(), status, contentLength: d.length);
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('UpdateDownloader', () {
    late Directory tmp;
    setUp(() async => tmp = await Directory.systemTemp.createTemp('upd'));
    tearDown(() async => tmp.delete(recursive: true));
    UpdateDownloader dl(Server s) => UpdateDownloader(client: s.client, dir: () async => tmp);
    List<String> files() => tmp.listSync().map((e) => e.path.split('/').last).toList()..sort();

    test('downloads, reports growing progress, verifies and leaves only the final file', () async {
      final s = Server();
      final seen = <int>[];
      final f = await dl(s).download(update(), 'https://shop.test', onProgress: (r, t) {
        expect(t, bytes.length);
        seen.add(r);
      });
      expect(f.path.endsWith('cheapbazar-9.0.0-5.apk'), true);
      expect(await f.readAsBytes(), bytes);
      expect(seen.length, greaterThan(1));
      expect(seen, orderedEquals([...seen]..sort()), reason: 'progress never goes backwards');
      expect(seen.last, bytes.length);
      expect(files(), ['cheapbazar-9.0.0-5.apk'], reason: 'no .part file left behind');
    });

    test('removes stale downloads from older versions', () async {
      await File('${tmp.path}/cheapbazar-1.0.0-1.apk').writeAsBytes([1, 2, 3]);
      await File('${tmp.path}/cheapbazar-1.1.0-2.apk.part').writeAsBytes([1]);
      await dl(Server()).download(update(), 'https://shop.test');
      expect(files(), ['cheapbazar-9.0.0-5.apk']);
    });

    test('reuses an already verified download without touching the network', () async {
      final s = Server();
      await dl(s).download(update(), 'https://shop.test');
      expect(s.requests, 1);
      final again = await dl(s).download(update(), 'https://shop.test');
      expect(s.requests, 1, reason: 'second request served from disk');
      expect(await again.readAsBytes(), bytes);
    });

    test('a damaged earlier file is not reused', () async {
      await File('${tmp.path}/cheapbazar-9.0.0-5.apk').writeAsBytes([...bytes]..[10] ^= 0xff);
      final s = Server();
      final f = await dl(s).download(update(), 'https://shop.test');
      expect(s.requests, 1, reason: 'bad file is replaced by a fresh download');
      expect(await f.readAsBytes(), bytes);
    });

    test('checksum mismatch is rejected and nothing is kept', () async {
      final tampered = [...bytes]..[1000] ^= 0x01;
      await expectLater(dl(Server(data: tampered)).download(update(), 'https://shop.test'), throwsA(isA<UpdateIntegrityError>()));
      expect(files(), isEmpty);
    });

    test('wrong size (truncated download) is rejected', () async {
      await expectLater(dl(Server(data: bytes.sublist(0, 1000))).download(update(), 'https://shop.test'), throwsA(isA<UpdateIntegrityError>()));
      expect(files(), isEmpty);
    });

    test('HTTP errors surface and leave no files', () async {
      await expectLater(dl(Server(status: 404)).download(update(), 'https://shop.test'), throwsA(isA<HttpException>()));
      await expectLater(dl(Server(status: 500)).download(update(), 'https://shop.test'), throwsA(isA<HttpException>()));
      expect(files(), isEmpty);
    });

    test('cancel stops mid-download and cleans up', () async {
      final token = UpdateCancelToken();
      await expectLater(
        dl(Server()).download(update(), 'https://shop.test', cancel: token, onProgress: (r, t) {
          if (r > 100 * 1024) token.cancel();
        }),
        throwsA(isA<UpdateCancelled>()),
      );
      expect(files(), isEmpty);
    });

    test('a latest.json without a checksum still downloads (older servers); size is still checked', () async {
      final f = await dl(Server()).download(update(sha: ''), 'https://shop.test');
      expect(await f.length(), bytes.length);
    });
  });

  test('checkForUpdate parses the checksum and rejects a malformed one', () async {
    http.Client c(Map<String, Object?> j) => MockClient((_) async => http.Response(jsonEncode(j), 200));
    final ok = await checkForUpdate(c({'version': '9.0.0', 'build': 5, 'file': 'cheapbazar-9.0.0-5.apk', 'size': 10, 'sha256': goodSha.toUpperCase()}), 'https://shop.test');
    expect(ok!.sha256, goodSha, reason: 'normalised to lower case');
    await expectLater(
      checkForUpdate(c({'version': '9.0.0', 'build': 5, 'file': 'cheapbazar-9.0.0-5.apk', 'size': 10, 'sha256': 'not-hex'}), 'https://shop.test'),
      throwsA(isA<FormatException>()),
    );
  });

  group('Check for updates (tile + dialog)', () {
    final latestJson = jsonEncode({'version': '9.0.0', 'build': 5, 'file': 'cheapbazar-9.0.0-5.apk', 'size': bytes.length, 'sha256': goodSha});

    Future<void> pump(WidgetTester tester, {required UpdateDownloader downloader, required ApkInstaller installer, bool bn = false, String? latest}) async {
      SharedPreferences.setMockInitialValues({if (bn) 'lang': 'bn'});
      final locale = LocaleController();
      await locale.load();
      final api = ApiClient(baseUrl: 'https://shop.test', client: MockClient((_) async => http.Response('{}', 200)));
      await tester.binding.setSurfaceSize(const Size(420, 900));
      await tester.pumpWidget(MultiProvider(
        providers: [Provider<ApiClient>.value(value: api), ChangeNotifierProvider<LocaleController>.value(value: locale)],
        child: MaterialApp(
          home: Scaffold(
            body: UpdateTile(
              client: MockClient((req) async => http.Response(latest ?? latestJson, latest == '404' ? 404 : 200)),
              downloader: downloader,
              installer: installer,
            ),
          ),
        ),
      ));
    }

    late Directory tmp;
    setUp(() async => tmp = await Directory.systemTemp.createTemp('upd'));
    tearDown(() async => tmp.delete(recursive: true));

    testWidgets('tap -> offer -> in-app download with progress -> installer opens -> can tap Install again', (tester) async {
      final installed = <String>[];
      final dl = UpdateDownloader(client: Server().client, dir: () async => tmp);
      await pump(tester, downloader: dl, installer: (f) async {
        installed.add(f.path);
        return InstallOutcome.started;
      });
      await tester.tap(find.text('Check for updates'));
      await tester.pumpAndSettle();
      expect(find.text('Update available'), findsOneWidget);
      expect(find.textContaining('downloads inside the app'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Update'));
      await until(tester, () => installed.isNotEmpty);
      await tester.pumpAndSettle();
      expect(installed.length, 1, reason: 'the installer is opened automatically once the download is verified');
      expect(installed.single.endsWith('cheapbazar-9.0.0-5.apk'), true);
      expect(File(installed.single).existsSync(), true);
      expect(find.text('Ready to install'), findsOneWidget);
      expect(find.textContaining('tap Install again'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Install'));
      await tester.pumpAndSettle();
      expect(installed.length, 2, reason: 'second tap re-opens the installer using the file already on disk');
    });

    testWidgets('shows live progress and Cancel stops the download', (tester) async {
      final gate = Completer<void>();
      final cancelled = Completer<bool>();
      final fake = _FakeDownloader((u, base, onProgress, cancel) async {
        onProgress?.call(150, 300);
        await gate.future;
        cancelled.complete(cancel?.cancelled ?? false);
        throw const UpdateCancelled();
      });
      await pump(tester, downloader: fake, installer: (f) async => InstallOutcome.started);
      await tester.tap(find.text('Check for updates'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Update'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Downloading update…'), findsOneWidget);
      expect(find.textContaining('50%'), findsOneWidget);
      final bar = tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      expect(bar.value, 0.5);

      await tester.tap(find.text('Cancel'));
      gate.complete();
      await tester.runAsync(() => cancelled.future);
      await tester.pumpAndSettle();
      expect(await cancelled.future, true);
      expect(find.byType(AlertDialog), findsNothing, reason: 'cancel closes the dialog');
    });

    testWidgets('a damaged download shows a clear message and Try again recovers', (tester) async {
      var attempt = 0;
      final fake = _FakeDownloader((u, base, onProgress, cancel) async {
        attempt++;
        if (attempt == 1) throw UpdateIntegrityError('checksum mismatch');
        final f = File('${tmp.path}/ok.apk')..writeAsBytesSync([1]);
        return f;
      });
      var opened = 0;
      await pump(tester, downloader: fake, installer: (f) async {
        opened++;
        return InstallOutcome.started;
      });
      await tester.tap(find.text('Check for updates'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Update'));
      await tester.pumpAndSettle();
      expect(find.text('The download was incomplete or damaged. Please try again.'), findsOneWidget);
      expect(opened, 0, reason: 'a damaged file is never handed to the installer');

      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(attempt, 2);
      expect(opened, 1);
      expect(find.text('Ready to install'), findsOneWidget);
    });

    testWidgets('network failure and installer failure each get their own message', (tester) async {
      final net = _FakeDownloader((u, base, onProgress, cancel) async => throw const SocketException('offline'));
      await pump(tester, downloader: net, installer: (f) async => InstallOutcome.started);
      await tester.tap(find.text('Check for updates'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Update'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Could not download the update'), findsOneWidget);
    });

    testWidgets('installer cannot open: message + Install button to retry', (tester) async {
      final fake = _FakeDownloader((u, base, onProgress, cancel) async => File('${tmp.path}/ok.apk')..writeAsBytesSync([1]));
      var calls = 0;
      await pump(tester, downloader: fake, installer: (f) async => ++calls == 1 ? InstallOutcome.failed : InstallOutcome.started);
      await tester.tap(find.text('Check for updates'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Update'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Could not open the installer'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Install'));
      await tester.pumpAndSettle();
      expect(calls, 2);
      expect(find.textContaining('Android will ask you to confirm'), findsOneWidget);
    });

    testWidgets('nothing published / already current -> "up to date", no dialog', (tester) async {
      final dl = UpdateDownloader(client: Server().client, dir: () async => tmp);
      await pump(tester, downloader: dl, installer: (f) async => InstallOutcome.started, latest: '404');
      await tester.tap(find.text('Check for updates'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.textContaining('latest'), findsOneWidget);
    });

    testWidgets('Bangla: dialog texts and percentage digits', (tester) async {
      final fake = _FakeDownloader((u, base, onProgress, cancel) async {
        onProgress?.call(1, 4);
        await Completer<void>().future; // stay in the downloading state
        throw StateError('unreachable');
      });
      await pump(tester, downloader: fake, installer: (f) async => InstallOutcome.started, bn: true);
      await tester.tap(find.text('আপডেট দেখুন'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'আপডেট করুন'));
      await tester.pump();
      await tester.pump();
      expect(find.text('আপডেট ডাউনলোড হচ্ছে…'), findsOneWidget);
      expect(find.textContaining('২৫%'), findsOneWidget);
    });
  });
}

/// Real file/network I/O does not advance with the test clock: alternate real waiting and test frames until [done].
Future<void> until(WidgetTester t, bool Function() done) async {
  for (var i = 0; i < 100 && !done(); i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
    await t.pump(const Duration(milliseconds: 10));
  }
}

class _FakeDownloader extends UpdateDownloader {
  _FakeDownloader(this._impl);
  final Future<File> Function(AppUpdate, String, void Function(int, int)?, UpdateCancelToken?) _impl;
  @override
  Future<File> download(AppUpdate u, String baseUrl, {void Function(int received, int total)? onProgress, UpdateCancelToken? cancel}) =>
      _impl(u, baseUrl, onProgress, cancel);
}
