import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:cheapbazar/config.dart';
import 'package:cheapbazar/state/app_update.dart';

http.Client latest(Object body, [int status = 200]) => MockClient((_) async => http.Response(jsonEncode(body), status));

void main() {
  test('AppConfig matches pubspec.yaml version+build (keeps the update check honest)', () {
    final line = File('pubspec.yaml').readAsLinesSync().firstWhere((l) => l.startsWith('version:'));
    final m = RegExp(r'version:\s*([0-9.]+)\+(\d+)').firstMatch(line)!;
    expect(AppConfig.version, m.group(1));
    expect(AppConfig.build, int.parse(m.group(2)!));
  });

  test('isNewerVersion compares version then build', () {
    bool n(String iv, int ib, String rv, int? rb) =>
        isNewerVersion(installedVersion: iv, installedBuild: ib, remoteVersion: rv, remoteBuild: rb);
    expect(n('1.0.0', 1, '1.0.1', 1), true);
    expect(n('1.0.9', 1, '1.1.0', 1), true);
    expect(n('1.2.0', 1, '1.10.0', 1), true); // numeric, not string, compare
    expect(n('1.0.0', 1, '1.0.0', 2), true);
    expect(n('1.0.0', 2, '1.0.0', 2), false);
    expect(n('1.0.0', 3, '1.0.0', 2), false);
    expect(n('1.1.0', 1, '1.0.9', 99), false);
    expect(n('1.0.0', 1, '1.0.0', null), false); // old latest.json without a build number
  });

  test('checkForUpdate: newer -> update, same -> null, none published -> null, junk -> throws', () async {
    final newer = {'version': '9.0.0', 'build': 5, 'file': 'cheapbazar-9.0.0-5.apk', 'size': 1048576};
    final u = await checkForUpdate(latest(newer), 'https://shop.test/');
    expect(u!.version, '9.0.0');
    expect(u.downloadUri('https://shop.test/').toString(), 'https://shop.test/downloads/cheapbazar-9.0.0-5.apk');

    final same = {'version': AppConfig.version, 'build': AppConfig.build, 'file': 'cheapbazar-1.apk', 'size': 1};
    expect(await checkForUpdate(latest(same), 'https://shop.test'), isNull);
    expect(await checkForUpdate(latest({}, 404), 'https://shop.test'), isNull);
    expect(() => checkForUpdate(latest({}, 500), 'https://shop.test'), throwsException);
    // a hostile/garbled file name must never be turned into a download link
    expect(() => checkForUpdate(latest({'version': '9.0.0', 'build': 5, 'file': '../../evil.apk', 'size': 1}), 'https://shop.test'), throwsA(isA<FormatException>()));
  });
}
