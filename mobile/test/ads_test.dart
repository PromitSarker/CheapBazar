import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'package:cheapbazar/api/api_client.dart';
import 'package:cheapbazar/state/ads.dart';
import 'package:cheapbazar/ui/widgets/network_ad.dart';

const unit = 'ca-app-pub-1234567890123456/1234567890';

ApiClient apiReturning(Object body, {int status = 200}) => ApiClient(
      baseUrl: 'http://x.test',
      client: MockClient((req) async {
        expect(req.url.path, '/api/m/v1/ads/config');
        return http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

void main() {
  group('AdsController.parseUnits', () {
    test('disabled, missing or malformed config means no ads', () {
      expect(AdsController.parseUnits(null), isEmpty);
      expect(AdsController.parseUnits('nope'), isEmpty);
      expect(AdsController.parseUnits({'admob': {'enabled': false, 'banners': {'home': unit}}}), isEmpty);
      expect(AdsController.parseUnits({'admob': {'enabled': true, 'banners': 'x'}}), isEmpty);
    });

    test('keeps only well-formed unit ids', () {
      final u = AdsController.parseUnits({
        'admob': {'enabled': true, 'banners': {'home': unit, 'browse': null, 'product': '<script>'}}
      });
      expect(u, {'home': unit});
    });
  });

  group('AdsController.load', () {
    test('starts the SDK and exposes units only when the server enables ads', () async {
      var inits = 0;
      final c = AdsController(
        apiReturning({'admob': {'enabled': true, 'testUnits': false, 'banners': {'home': unit, 'browse': null, 'product': null}}}),
        initSdk: () async => inits++,
        androidOnly: true,
      );
      expect(c.enabled, isFalse);
      await c.load();
      expect(inits, 1);
      expect(c.enabled, isTrue);
      expect(c.unit('home'), unit);
      expect(c.unit('browse'), isNull, reason: 'a placement with no unit stays empty');
      await c.load();
      expect(inits, 1, reason: 'loads once');
    });

    test('server says off: the ads SDK is never started', () async {
      var inits = 0;
      final c = AdsController(
        apiReturning({'admob': {'enabled': false, 'testUnits': false, 'banners': {'home': null, 'browse': null, 'product': null}}}),
        initSdk: () async => inits++,
        androidOnly: true,
      );
      await c.load();
      expect(inits, 0);
      expect(c.enabled, isFalse);
      expect(c.unit('home'), isNull);
    });

    test('an old server (404), an error, or an SDK failure leave the app ad-free and do not throw', () async {
      final notFound = AdsController(apiReturning({'error': 'Not found', 'code': 'NOT_FOUND'}, status: 404), initSdk: () async {}, androidOnly: true);
      await notFound.load();
      expect(notFound.enabled, isFalse);

      final sdkBroken = AdsController(
        apiReturning({'admob': {'enabled': true, 'banners': {'home': unit}}}),
        initSdk: () async => throw StateError('no play services'),
        androidOnly: true,
      );
      await sdkBroken.load();
      expect(sdkBroken.enabled, isFalse);
      expect(sdkBroken.unit('home'), isNull);
    });

    test('unsupported platform: does not even ask the server', () async {
      var asked = false;
      final c = AdsController(
        ApiClient(baseUrl: 'http://x.test', client: MockClient((_) async {
          asked = true;
          return http.Response('{}', 200);
        })),
        initSdk: () async {},
        androidOnly: false,
      );
      await c.load();
      expect(asked, isFalse);
    });
  });

  testWidgets('NetworkAd takes no space while ads are off', (tester) async {
    final c = AdsController(apiReturning({'admob': {'enabled': false, 'banners': {}}}), initSdk: () async {}, androidOnly: true);
    await c.load();
    await tester.pumpWidget(ChangeNotifierProvider<AdsController>.value(
      value: c,
      child: const MaterialApp(home: Scaffold(body: Column(children: [Text('above'), NetworkAd(placement: 'home'), Text('below')]))),
    ));
    expect(tester.getSize(find.byType(NetworkAd)), Size.zero);
    expect(find.text('Ad'), findsNothing);
    expect(find.text('above'), findsOneWidget);
    expect(find.text('below'), findsOneWidget);
  });
}
