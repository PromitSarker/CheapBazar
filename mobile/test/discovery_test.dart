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
import 'package:cheapbazar/state/recent_searches.dart';
import 'package:cheapbazar/state/session.dart';
import 'package:cheapbazar/ui/widgets/filter_sheet.dart';

http.Response j(Object body, [int s = 200]) => http.Response(jsonEncode(body), s, headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, dynamic> item(String id, String name, num price, {num? was, int pct = 0, String? brand, String? cat}) => {
      'productId': id, 'name': name, 'description': 'About $name', 'image': null, 'images': <String>[],
      'store': {'id': 's1', 'slug': 'fresh', 'name': 'Fresh Mart'}, 'inStock': true, 'price': price, 'stock': 9,
      'compareAtPrice': was, 'discountPct': pct, 'brand': brand, 'unit': null, 'categoryId': cat,
    };

final apple = item('p1', 'Red Apple', 80, was: 100, pct: 20, brand: 'Orchard', cat: 'fruit');
final rice = item('p2', 'Miniket Rice', 120, brand: 'Gold', cat: 'rice');

final tree = [
  {'id': 'food', 'parentId': null, 'slug': 'food', 'nameEn': 'Grocery & Food', 'nameBn': 'মুদি', 'icon': 'local_grocery_store', 'count': 5, 'children': [
    {'id': 'fruit', 'parentId': 'food', 'slug': 'fruit', 'nameEn': 'Fruits', 'nameBn': 'ফল', 'icon': 'label_outline', 'count': 3, 'children': <Object>[]},
  ]},
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('pure logic', () {
    test('recent searches: newest first, case-insensitive de-dupe, capped, short terms ignored', () {
      var l = <String>[];
      for (final t in ['mango', 'Rice', 'MANGO', 'x', ' ', 'oil']) {
        l = RecentSearches.pushed(l, t);
      }
      expect(l, ['oil', 'MANGO', 'Rice']);
      for (var i = 0; i < 12; i++) {
        l = RecentSearches.pushed(l, 'term $i');
      }
      expect(l.length, RecentSearches.max);
      expect(l.first, 'term 11');
    });

    test('filters: counts, clearing with copyWith, equality', () {
      const f = ProductFilters();
      expect(f.activeCount, 0);
      final g = f.copyWith(brand: 'Orchard', min: 50.0, inStock: true);
      expect(g.activeCount, 3);
      expect(g.copyWith(brand: null).brand, null, reason: 'null clears the brand');
      expect(g.copyWith(inStock: false).brand, 'Orchard', reason: 'untouched fields stay');
      expect(g.copyWith(min: null, max: null).activeCount, 2);
      expect(const ProductFilters(onSale: true), const ProductFilters(onSale: true));
      expect(g == f, false);
    });

    test('persisted recents round-trip', () async {
      SharedPreferences.setMockInitialValues({});
      await RecentSearches.add('red apple');
      await RecentSearches.add('rice');
      expect(await RecentSearches.load(), ['rice', 'red apple']);
      await RecentSearches.clear();
      expect(await RecentSearches.load(), isEmpty);
    });
  });

  group('app flows', () {
    late List<String> requests;

    Future<void> boot(WidgetTester tester, {Map<String, Object> prefs = const {}, Future<http.Response> Function(String path, http.Request req)? extra}) async {
      SharedPreferences.setMockInitialValues(prefs);
      FlutterSecureStorage.setMockInitialValues({});
      requests = [];
      final client = MockClient((req) async {
        final path = req.url.path.replaceFirst('/api/m/v1', '');
        requests.add('$path?${req.url.query}');
        if (extra != null) {
          final r = await extra(path, req);
          if (r.statusCode != 599) return r;
        }
        if (path == '/config') return j({'minAppVersion': '1.0.0'});
        if (path == '/categories') return j({'categories': tree});
        if (path == '/home') {
          return j({'ads': [], 'stores': [], 'items': [apple, rice], 'categories': tree, 'shelves': [
            {'key': 'new', 'title': {'en': 'New arrivals', 'bn': 'নতুন'}, 'items': [apple, rice]},
          ]});
        }
        if (path == '/browse') {
          final p = req.url.queryParameters;
          var items = [apple, rice];
          if (p['brand'] == 'Orchard') items = [apple];
          return j({
            'tab': 'retail', 'items': items, 'total': items.length, 'page': 1, 'pages': 1, 'paywall': null, 'ads': [],
            'facets': {'stores': [], 'categories': [], 'brands': [{'brand': 'Orchard', 'count': 1}, {'brand': 'Gold', 'count': 1}]},
          });
        }
        if (path == '/search/suggest') {
          return j({'suggestions': ['Apple juice', 'Apple vinegar'], 'categories': [{'id': 'fruit', 'nameEn': 'Fruits', 'nameBn': 'ফল'}]});
        }
        return j({'error': 'not mocked: $path'}, 404);
      });
      final api = ApiClient(baseUrl: 'https://shop.test', client: client);
      await tester.binding.setSurfaceSize(const Size(420, 900));
      await tester.pumpWidget(CheapBazarApp(api: api, session: SessionController(api), cart: CartController(), locale: LocaleController()));
      await tester.pumpAndSettle();
    }

    Future<void> openBrowse(WidgetTester tester) async {
      await tester.tap(find.text('Search products or stores'));
      await tester.pumpAndSettle();
    }

    testWidgets('filter sheet: brand + price narrow the list, show as removable chips, and clear again', (tester) async {
      await boot(tester);
      await openBrowse(tester);
      expect(find.text('Miniket Rice'), findsWidgets);

      await tester.tap(find.byIcon(Zi.filter));
      await tester.pumpAndSettle();
      expect(find.text('Filters'), findsOneWidget);
      expect(find.text('Orchard (1)'), findsOneWidget);
      await tester.tap(find.text('Orchard (1)'));
      await tester.enterText(find.widgetWithText(TextField, 'Min'), '50');
      await tester.enterText(find.widgetWithText(TextField, 'Max'), '200');
      await tester.tap(find.text('Show results'));
      await tester.pumpAndSettle();

      final q = requests.lastWhere((r) => r.startsWith('/browse'));
      expect(q, contains('brand=Orchard'));
      expect(q, contains('min=50.0'));
      expect(q, contains('max=200.0'));
      expect(find.text('Miniket Rice'), findsNothing, reason: 'filtered out');
      expect(find.widgetWithText(InputChip, 'Orchard'), findsOneWidget);

      await tester.tap(find.byTooltip('Delete').first); // brand chip comes first (price chip is second)
      await tester.pumpAndSettle();
      expect(requests.lastWhere((r) => r.startsWith('/browse')), isNot(contains('brand=')));
      expect(find.text('Miniket Rice'), findsWidgets);
    });

    testWidgets('filter sheet: reversed price range is swapped, not rejected; reset clears everything', (tester) async {
      await boot(tester);
      await openBrowse(tester);
      await tester.tap(find.byIcon(Zi.filter));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Min'), '300');
      await tester.enterText(find.widgetWithText(TextField, 'Max'), '100');
      await tester.tap(find.text('Show results'));
      await tester.pumpAndSettle();
      final q = requests.lastWhere((r) => r.startsWith('/browse'));
      expect(q, contains('min=100.0'));
      expect(q, contains('max=300.0'));

      await tester.tap(find.byIcon(Zi.filter));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Reset'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Show results'));
      await tester.pumpAndSettle();
      final after = requests.lastWhere((r) => r.startsWith('/browse'));
      expect(after, isNot(contains('min=')));
      expect(after, isNot(contains('max=')));
    });

    testWidgets('recent searches appear when the box is focused and empty; tapping one searches it', (tester) async {
      await boot(tester, prefs: {'recent_searches_v1': ['mango', 'rice']});
      await openBrowse(tester);
      expect(find.text('Recent searches'), findsOneWidget);
      expect(find.text('mango'), findsOneWidget);
      await tester.tap(find.text('rice'));
      await tester.pumpAndSettle();
      expect(requests.lastWhere((r) => r.startsWith('/browse')), contains('q=rice'));
      expect(find.text('Recent searches'), findsNothing, reason: 'panel closes after choosing');
      expect(await RecentSearches.load(), ['rice', 'mango'], reason: 'the chosen term moves to the top');
    });

    testWidgets('typing shows suggestions + a matching category; a suggestion runs the search; a category opens it', (tester) async {
      await boot(tester);
      await openBrowse(tester);
      await tester.enterText(find.byType(TextField).first, 'app');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      expect(requests.any((r) => r.startsWith('/search/suggest') && r.contains('q=app')), true);
      expect(find.text('Apple juice'), findsOneWidget);
      expect(find.text('in Fruits'), findsOneWidget);

      await tester.tap(find.text('Apple juice'));
      await tester.pumpAndSettle();
      expect(requests.lastWhere((r) => r.startsWith('/browse')), contains('q=Apple+juice'));

      // a fresh box: picking the category suggestion filters by it and clears the text
      await tester.enterText(find.byType(TextField).first, 'fru');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      await tester.tap(find.text('in Fruits'));
      await tester.pumpAndSettle();
      expect(requests.lastWhere((r) => r.startsWith('/browse')), contains('category=fruit'));
    });

    testWidgets('a failing suggestion request never breaks typing', (tester) async {
      await boot(tester, extra: (path, req) async => path == '/search/suggest' ? j({'error': 'boom'}, 503) : http.Response('', 599));
      await openBrowse(tester);
      await tester.enterText(find.byType(TextField).first, 'apple');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Red Apple'), findsWidgets);
    });

    testWidgets('product page: refreshes price from the server and shows similar products', (tester) async {
      await boot(tester, extra: (path, req) async {
        if (path == '/products/p1') {
          return j({'tab': 'retail', 'item': {...apple, 'price': 70, 'compareAtPrice': 100, 'discountPct': 30}, 'paywall': null, 'similar': [rice]});
        }
        return http.Response('', 599);
      });
      await tester.tap(find.text('Red Apple').first);
      await tester.pumpAndSettle();
      expect(requests.any((r) => r.startsWith('/products/p1')), true);
      expect(find.text('৳70.00'), findsWidgets, reason: 'live price replaces the list price');
      expect(find.text('You may also like'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Miniket Rice'), 300, scrollable: find.byType(Scrollable).first);
      expect(find.text('Miniket Rice'), findsWidgets);
    });

    testWidgets('product page still works when the live lookup fails', (tester) async {
      await boot(tester);
      await tester.tap(find.text('Red Apple').first);
      await tester.pumpAndSettle();
      expect(find.text('৳80.00'), findsWidgets);
      expect(find.text('You may also like'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });
}
