import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cheapbazar/ui/icons.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cheapbazar/api/api_client.dart';
import 'package:cheapbazar/main.dart';
import 'package:cheapbazar/models/models.dart';
import 'package:cheapbazar/state/cart.dart';
import 'package:cheapbazar/state/l10n.dart';
import 'package:cheapbazar/state/session.dart';
import 'package:cheapbazar/ui/widgets/product_card.dart';

http.Response j(Object body, [int s = 200]) => http.Response(jsonEncode(body), s, headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, dynamic> item(String id, String name, num price, {num? was, int pct = 0, int stock = 9, String? brand, String? unit, String? cat}) => {
      'productId': id, 'name': name, 'description': '', 'image': null, 'images': <String>[],
      'store': {'id': 's1', 'slug': 'fresh', 'name': 'Fresh Mart'}, 'inStock': stock > 0, 'price': price, 'stock': stock,
      'compareAtPrice': was, 'discountPct': pct, 'brand': brand, 'unit': unit, 'categoryId': cat,
    };

Map<String, dynamic> cat(String id, String en, String bn, String icon, int count, [List<Map<String, dynamic>> kids = const []]) =>
    {'id': id, 'parentId': null, 'slug': id, 'nameEn': en, 'nameBn': bn, 'icon': icon, 'count': count, 'children': kids};
Map<String, dynamic> sub(String id, String parent, String en, String bn, int count) =>
    {'id': id, 'parentId': parent, 'slug': id, 'nameEn': en, 'nameBn': bn, 'icon': 'label_outline', 'count': count, 'children': <Map<String, dynamic>>[]};

final apple = item('p1', 'Red Apple', 80, was: 100, pct: 20, brand: 'Orchard', unit: '1 kg', cat: 'fruit');
final rice = item('p2', 'Miniket Rice', 120, cat: 'rice');

final categories = [
  cat('food', 'Grocery & Food', 'মুদি ও খাবার', 'local_grocery_store', 5, [sub('fruit', 'food', 'Fruits', 'ফল', 3), sub('rice', 'food', 'Rice & Oil', 'চাল ও তেল', 2)]),
  cat('fashion', 'Fashion', 'ফ্যাশন', 'checkroom', 0),
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('models', () {
    test('discount, gallery, subtitle and category parsing', () {
      final p = Product.fromBrowse({...apple, 'images': ['/uploads/a.png', '/uploads/b.png'], 'image': '/uploads/a.png'});
      expect(p.onSale, true);
      expect(p.discountPct, 20);
      expect(p.compareAtPrice, 100);
      expect(p.subtitle, 'Orchard · 1 kg');
      expect(p.gallery, ['/uploads/a.png', '/uploads/b.png']);
      expect(p.categoryId, 'fruit');

      // an old server sends none of the new fields
      final old = Product.fromBrowse({
        'productId': 'x', 'name': 'Old', 'description': '', 'image': '/uploads/o.png',
        'store': {'id': 's', 'slug': 's', 'name': 'S'}, 'inStock': true, 'price': 10, 'stock': 2,
      });
      expect(old.onSale, false);
      expect(old.subtitle, '');
      expect(old.gallery, ['/uploads/o.png']);
      expect(old.categoryId, null);

      // a "was" price that is not higher is never a discount; wholesale/locked never show one
      expect(Product.fromBrowse({...apple, 'compareAtPrice': 80}).onSale, false);
      expect(Product.fromBrowse({...apple, 'locked': true}, wholesale: true).onSale, false);
    });

    test('category tree and shelves parse; names follow the language', () {
      final c = ShopCategory.fromJson(categories.first);
      expect(c.children.length, 2);
      expect(c.name(false), 'Grocery & Food');
      expect(c.name(true), 'মুদি ও খাবার');
      expect(ShopCategory.fromJson({...categories.first, 'nameBn': ''}).name(true), 'Grocery & Food', reason: 'falls back to English');
      final s = Shelf.fromJson({'key': 'deals', 'title': {'en': 'Deals', 'bn': 'ডিল'}, 'onSale': true, 'items': [apple]});
      expect(s.title(true), 'ডিল');
      expect(s.onSale, true);
      expect(s.items.single.name, 'Red Apple');
    });

    test('bag helpers: quantityOf, decrement removes at one, total across shops', () async {
      SharedPreferences.setMockInitialValues({});
      final cart = CartController();
      final p = Product.fromBrowse(apple);
      expect(cart.quantityOf('p1'), 0);
      cart.add(p);
      cart.add(p);
      expect(cart.quantityOf('p1'), 2);
      expect(cart.total, 160);
      cart.decrement('p1');
      expect(cart.quantityOf('p1'), 1);
      cart.decrement('p1');
      expect(cart.isEmpty, true);
      cart.decrement('p1'); // no-op on a missing line
      expect(cart.isEmpty, true);
    });
  });

  group('product card', () {
    Future<CartController> pump(WidgetTester tester, Product p, {double textScale = 1}) async {
      SharedPreferences.setMockInitialValues({});
      final cart = CartController();
      final locale = LocaleController();
      final api = ApiClient(baseUrl: 'https://shop.test', client: MockClient((_) async => j({})));
      await tester.binding.setSurfaceSize(const Size(420, 900));
      await tester.pumpWidget(MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: api),
          ChangeNotifierProvider<CartController>.value(value: cart),
          ChangeNotifierProvider<LocaleController>.value(value: locale),
        ],
        child: MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(size: const Size(420, 900), textScaler: TextScaler.linear(textScale)),
            child: Scaffold(
              body: Builder(
                builder: (c) => GridView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: 2,
                  gridDelegate: productGridDelegate(c),
                  itemBuilder: (_, _) => ProductCard(product: p, onTap: () {}),
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      return cart;
    }

    testWidgets('shows the discount badge, crossed-out price, subtitle and ADD', (tester) async {
      await pump(tester, Product.fromBrowse(apple));
      expect(find.text('20% OFF'), findsWidgets);
      expect(find.text('৳100.00'), findsWidgets);
      expect(find.text('৳80.00'), findsWidgets);
      expect(find.text('Orchard · 1 kg'), findsWidgets);
      expect(find.text('Add'), findsNWidgets(2));
    });

    testWidgets('ADD -> stepper -> + / - -> back to ADD', (tester) async {
      final cart = await pump(tester, Product.fromBrowse(apple));
      expect(find.text('Add'), findsNWidgets(2));
      await tester.tap(find.text('Add').first);
      await tester.pumpAndSettle();
      expect(cart.quantityOf('p1'), 1);
      expect(find.text('Add'), findsNothing, reason: 'both cards show the same product, so both become steppers');
      expect(find.byIcon(Zi.remove), findsNWidgets(2));

      await tester.tap(find.byIcon(Zi.add).first);
      await tester.pumpAndSettle();
      expect(cart.quantityOf('p1'), 2);
      expect(find.text('2'), findsNWidgets(2));

      await tester.tap(find.byIcon(Zi.remove).first);
      await tester.tap(find.byIcon(Zi.remove).first);
      await tester.pumpAndSettle();
      expect(cart.isEmpty, true);
      expect(find.text('Add'), findsNWidgets(2));
    });

    testWidgets('the + stops at the stock limit', (tester) async {
      final cart = await pump(tester, Product.fromBrowse(item('p9', 'Last Ones', 50, stock: 2)));
      await tester.tap(find.text('Add').first);
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Zi.add).first);
      await tester.pumpAndSettle();
      expect(cart.quantityOf('p9'), 2);
      await tester.tap(find.byIcon(Zi.add).first);
      await tester.pumpAndSettle();
      expect(cart.quantityOf('p9'), 2, reason: 'cannot exceed stock');
    });

    testWidgets('out of stock and wholesale cards have no ADD button', (tester) async {
      await pump(tester, Product.fromBrowse(item('p3', 'Gone', 10, stock: 0)));
      expect(find.text('Add'), findsNothing);
      expect(find.text('Out of stock'), findsWidgets);

      await pump(tester, Product.fromBrowse({...item('p4', 'Flour', 0), 'wholesalePrice': 300, 'moq': 10, 'tiers': []}, wholesale: true));
      expect(find.text('Add'), findsNothing);
      expect(find.textContaining('10'), findsWidgets, reason: 'shows the minimum order quantity');
    });

    testWidgets('large system text does not overflow the card', (tester) async {
      await pump(tester, Product.fromBrowse({...apple, 'name': 'A Very Long Product Name That Needs Two Lines At Least'}), textScale: 1.6);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Bangla: digits and labels', (tester) async {
      SharedPreferences.setMockInitialValues({'lang': 'bn'});
      final locale = LocaleController();
      await locale.load();
      final cart = CartController();
      final api = ApiClient(baseUrl: 'https://shop.test', client: MockClient((_) async => j({})));
      await tester.binding.setSurfaceSize(const Size(420, 900));
      await tester.pumpWidget(MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: api),
          ChangeNotifierProvider<CartController>.value(value: cart),
          ChangeNotifierProvider<LocaleController>.value(value: locale),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: SizedBox(width: 190, height: 330, child: ProductCard(product: Product.fromBrowse(apple), onTap: () {})),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('২০% ছাড়'), findsOneWidget);
      expect(find.text('যোগ করুন'), findsOneWidget);
    });
  });

  group('app flow with categories', () {
    late List<String> requests;

    Future<(CartController, LocaleController)> boot(WidgetTester tester, {Map<String, dynamic>? home}) async {
      SharedPreferences.setMockInitialValues({});
      FlutterSecureStorage.setMockInitialValues({});
      requests = [];
      final client = MockClient((req) async {
        final path = req.url.path.replaceFirst('/api/m/v1', '');
        requests.add('$path?${req.url.query}');
        if (path == '/config') return j({'minAppVersion': '1.0.0'});
        if (path == '/categories') return j({'categories': categories});
        if (path == '/home') {
          return j(home ??
              {
                'ads': [],
                'stores': [],
                'items': [apple, rice],
                'categories': categories,
                'shelves': [
                  {'key': 'deals', 'title': {'en': 'Deals & offers', 'bn': 'অফার ও ডিল'}, 'onSale': true, 'items': [apple]},
                  {'key': 'cat:food', 'title': {'en': 'Grocery & Food', 'bn': 'মুদি ও খাবার'}, 'categoryId': 'food', 'items': [apple, rice]},
                ],
              });
        }
        if (path == '/browse') {
          final c = req.url.queryParameters['category'];
          final items = c == 'rice' ? [rice] : (c == 'fruit' ? [apple] : [apple, rice]);
          return j({'tab': 'retail', 'items': items, 'total': items.length, 'page': 1, 'pages': 1, 'paywall': null, 'ads': []});
        }
        return j({'error': 'not mocked: $path'}, 404);
      });
      final api = ApiClient(baseUrl: 'https://shop.test', client: client);
      final cart = CartController();
      final locale = LocaleController();
      await tester.binding.setSurfaceSize(const Size(420, 900));
      await tester.pumpWidget(CheapBazarApp(api: api, session: SessionController(api), cart: cart, locale: locale));
      await tester.pumpAndSettle();
      return (cart, locale);
    }

    testWidgets('home shows departments and shelves; a department opens its listing with the category filter', (tester) async {
      await boot(tester);
      expect(find.text('Categories'), findsWidgets);
      expect(find.text('Grocery & Food'), findsWidgets);
      expect(find.text('Deals & offers'), findsOneWidget);
      expect(find.text('All'), findsOneWidget);

      await tester.tap(find.text('Grocery & Food').first);
      await tester.pumpAndSettle();
      expect(requests.any((r) => r.startsWith('/browse') && r.contains('category=food')), true);
      // the department's sub-categories appear as chips; picking one re-queries
      expect(find.textContaining('Fruits'), findsOneWidget);
      await tester.tap(find.textContaining('Fruits'));
      await tester.pumpAndSettle();
      expect(requests.last, contains('category=fruit'));
      expect(find.text('Red Apple'), findsWidgets);
    });

    testWidgets('sticky bag bar appears after ADD and opens the Bag tab', (tester) async {
      final (cart, _) = await boot(tester);
      expect(find.textContaining('View bag'), findsNothing);
      await tester.tap(find.text('Add').first);
      await tester.pumpAndSettle();
      expect(cart.count, 1);
      expect(find.textContaining('View bag'), findsOneWidget);
      expect(find.textContaining('1 item'), findsOneWidget);

      await tester.tap(find.textContaining('View bag'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Checkout ·'), findsOneWidget, reason: 'landed on the Bag tab');
      expect(find.textContaining('View bag'), findsNothing, reason: 'no strip on the Bag tab itself');
    });

    testWidgets('categories tab: pick a department, then a sub-category', (tester) async {
      await boot(tester);
      await tester.tap(find.text('Categories').last); // the nav tab
      await tester.pumpAndSettle();
      expect(find.text('Fashion'), findsOneWidget);
      expect(find.text('Fruits'), findsOneWidget, reason: 'first department selected by default');
      await tester.tap(find.text('Fashion'));
      await tester.pumpAndSettle();
      expect(find.text('No products here yet'), findsOneWidget);
      await tester.tap(find.text('Grocery & Food'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rice & Oil'));
      await tester.pumpAndSettle();
      expect(requests.last, contains('category=rice'));
      expect(find.text('Miniket Rice'), findsWidgets);
    });

    testWidgets('an older server (no categories/shelves) still shows products on Home', (tester) async {
      await boot(tester, home: {'ads': [], 'stores': [], 'items': [apple, rice]});
      expect(find.text('Red Apple'), findsWidgets);
      expect(find.text('Deals & offers'), findsNothing);
    });

    testWidgets('Bangla: nav, headings and category names', (tester) async {
      final (_, locale) = await boot(tester);
      await locale.set('bn');
      await tester.pumpAndSettle();
      expect(find.text('ক্যাটাগরি'), findsWidgets);
      expect(find.text('অফার ও ডিল'), findsOneWidget);
      expect(find.text('মুদি ও খাবার'), findsWidgets);
    });
  });
}
