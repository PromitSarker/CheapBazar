import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cheapbazar/ui/icons.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cheapbazar/api/api_client.dart';
import 'package:cheapbazar/main.dart';
import 'package:cheapbazar/state/cart.dart';
import 'package:cheapbazar/state/l10n.dart';
import 'package:cheapbazar/state/location.dart';
import 'package:cheapbazar/state/session.dart';

http.Response j(Object body, [int s = 200]) => http.Response(jsonEncode(body), s, headers: {'content-type': 'application/json; charset=utf-8'});

final districts = [
  {'id': 'dhaka', 'nameEn': 'Dhaka', 'nameBn': 'ঢাকা', 'lat': 23.8103, 'lng': 90.4125},
  {'id': 'sylhet', 'nameEn': 'Sylhet', 'nameBn': 'সিলেট', 'lat': 24.8949, 'lng': 91.8687},
];
final apple = {
  'productId': 'p1', 'name': 'Red Apple', 'description': '', 'image': null, 'images': <String>[],
  'store': {'id': 's1', 'slug': 'fresh', 'name': 'Fresh Mart', 'distanceKm': 2.3}, 'inStock': true, 'price': 80, 'stock': 9,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('API client', () {
    test('adds the buyer position to browsing requests only, and to orders', () async {
      final seen = <http.Request>[];
      final api = ApiClient(baseUrl: 'https://shop.test', client: MockClient((req) async {
        seen.add(req);
        return j({'ok': true});
      }));
      await api.get('/browse', query: {'q': 'rice'});
      expect(seen.last.url.queryParameters.containsKey('lat'), false, reason: 'no position known yet');

      api.location = (lat: 23.81, lng: 90.413);
      await api.get('/browse', query: {'q': 'rice'});
      expect(seen.last.url.queryParameters, {'q': 'rice', 'lat': '23.81', 'lng': '90.413'});
      for (final p in ['/home', '/search/suggest', '/products/p1', '/stores/fresh', '/categories']) {
        await api.get(p);
        expect(seen.last.url.queryParameters['lat'], '23.81', reason: p);
      }
      for (final p in ['/me', '/my/orders', '/notifications', '/pro', '/config']) {
        await api.get(p);
        expect(seen.last.url.queryParameters.containsKey('lat'), false, reason: '$p must not carry the position');
      }

      await api.post('/orders', {'storeSlug': 'fresh', 'items': <Object>[]});
      expect(jsonDecode(seen.last.body)['location'], {'lat': 23.81, 'lng': 90.413});
      await api.post('/auth/login', {'email': 'a'});
      expect(jsonDecode(seen.last.body).containsKey('location'), false);
    });
  });

  group('LocationController', () {
    ApiClient apiWith(Map<String, dynamic> config) =>
        ApiClient(baseUrl: 'https://shop.test', client: MockClient((req) async => req.url.path.endsWith('/location/config') ? j(config) : j({}, 404)));

    test('reads the admin rule and district list; an old server (404) means no limit', () async {
      SharedPreferences.setMockInitialValues({});
      final c = LocationController(apiWith({'enabled': true, 'radiusKm': 25, 'districts': districts}));
      await c.refreshConfig();
      expect(c.enabled, true);
      expect(c.radiusKm, 25);
      expect(c.districts.map((d) => d.id), ['dhaka', 'sylhet']);

      final old = LocationController(ApiClient(baseUrl: 'https://shop.test', client: MockClient((_) async => j({'error': 'nf'}, 404))));
      await old.refreshConfig();
      expect(old.enabled, false);
    });

    test('choosing a district sets and remembers the position (rounded), bumps the version, and survives a restart', () async {
      SharedPreferences.setMockInitialValues({});
      final api = apiWith({'enabled': true, 'radiusKm': 25, 'districts': districts});
      final c = LocationController(api);
      await c.refreshConfig();
      final v0 = c.version;
      await c.chooseDistrict(c.districts.first);
      expect(c.hasLocation, true);
      expect(c.lat, 23.81);
      expect(c.label, 'dhaka');
      expect(api.location, (lat: 23.81, lng: 90.413));
      expect(c.version, greaterThan(v0));
      expect(c.shortLabel(false, nearMe: 'Near me', notSet: 'Set location'), 'Dhaka');
      expect(c.shortLabel(true, nearMe: 'x', notSet: 'y'), 'ঢাকা');

      final api2 = apiWith({'enabled': true, 'radiusKm': 25, 'districts': districts});
      final again = LocationController(api2);
      await again.load();
      expect(again.hasLocation, true);
      expect(api2.location, (lat: 23.81, lng: 90.413), reason: 'the saved position is attached from the first request');

      await again.clear();
      expect(again.hasLocation, false);
      expect(api2.location, isNull);
      final third = LocationController(apiWith({}));
      await third.load();
      expect(third.hasLocation, false, reason: 'forgotten for good');
    });

    test('GPS success stores a rounded position; failures surface a reason and change nothing', () async {
      SharedPreferences.setMockInitialValues({});
      final ok = LocationController(apiWith({}), fetcher: () async => (lat: 22.356911, lng: 91.783222));
      await ok.useGps();
      expect((ok.lat, ok.lng, ok.label), (22.357, 91.783, 'gps'));
      expect(ok.shortLabel(false, nearMe: 'Near me', notSet: '-'), 'Near me');

      final denied = LocationController(apiWith({}), fetcher: () async => throw LocationException('denied'));
      await expectLater(denied.useGps(), throwsA(isA<LocationException>().having((e) => e.code, 'code', 'denied')));
      expect(denied.hasLocation, false);
    });
  });

  group('screens', () {
    late List<String> requests;

    Future<LocationController> boot(WidgetTester tester, {PositionFetcher? fetcher, bool rangeOn = true}) async {
      SharedPreferences.setMockInitialValues({});
      FlutterSecureStorage.setMockInitialValues({});
      requests = [];
      final client = MockClient((req) async {
        final path = req.url.path.replaceFirst('/api/m/v1', '');
        requests.add('$path?${req.url.query}');
        if (path == '/config') return j({'minAppVersion': '1.0.0'});
        if (path == '/location/config') return j({'enabled': rangeOn, 'radiusKm': rangeOn ? 25 : null, 'districts': districts});
        if (path == '/categories') return j({'categories': []});
        if (path == '/home') {
          final has = req.url.queryParameters.containsKey('lat');
          return j({
            'ads': [], 'stores': [], 'categories': [], 'shelves': [], 'items': has ? [apple] : [],
            'location': {'enabled': rangeOn, 'radiusKm': rangeOn ? 25 : null, 'required': rangeOn && !has, 'applied': rangeOn && has},
          });
        }
        return j({'error': 'not mocked: $path'}, 404);
      });
      final api = ApiClient(baseUrl: 'https://shop.test', client: client);
      final loc = LocationController(api, fetcher: fetcher);
      await loc.load();
      await tester.binding.setSurfaceSize(const Size(420, 900));
      await tester.pumpWidget(CheapBazarApp(api: api, session: SessionController(api), cart: CartController(), locale: LocaleController(), location: loc));
      await tester.pumpAndSettle();
      return loc;
    }

    testWidgets('limit on, no position: home asks for a location; picking a district reloads home with it', (tester) async {
      final loc = await boot(tester);
      expect(find.text('Shops near you'), findsOneWidget);
      expect(find.textContaining('within 25 km'), findsWidgets);

      await tester.tap(find.text('Set my location'));
      await tester.pumpAndSettle();
      expect(find.text('Where are you?'), findsOneWidget);
      expect(find.text('Use my current location'), findsOneWidget);
      await tester.tap(find.text('Sylhet'));
      await tester.pumpAndSettle();

      expect(loc.label, 'sylhet');
      expect(requests.last, contains('lat=24.895'));
      expect(requests.last, contains('lng=91.869'));
      expect(find.text('Shops near you'), findsNothing);
      expect(find.text('Sylhet'), findsOneWidget, reason: 'the bar under the app bar now shows the chosen place');
      expect(find.text('  ·  within 25 km'), findsOneWidget);
    });

    testWidgets('GPS refused: the sheet explains and offers the district list', (tester) async {
      await boot(tester, fetcher: () async => throw LocationException('denied'));
      await tester.tap(find.text('Set my location'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Use my current location'));
      await tester.pumpAndSettle();
      expect(find.textContaining('permission was denied'), findsOneWidget);
      expect(find.text('Dhaka'), findsOneWidget, reason: 'districts stay available as the fallback');
    });

    testWidgets('GPS works: one tap closes the sheet and loads what is nearby', (tester) async {
      final loc = await boot(tester, fetcher: () async => (lat: 23.8103, lng: 90.4125));
      await tester.tap(find.text('Set my location'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Use my current location'));
      await tester.pumpAndSettle();
      expect(loc.label, 'gps');
      expect(find.text('Where are you?'), findsNothing);
      expect(find.text('Near me'), findsOneWidget);
      expect(requests.last, contains('lat=23.81'));
    });

    testWidgets('limit off: no prompt and no location chip', (tester) async {
      await boot(tester, rangeOn: false);
      expect(find.text('Shops near you'), findsNothing);
      expect(find.text('Set location'), findsNothing);
      expect(find.byIcon(Zi.place), findsNothing);
    });
  });
}
