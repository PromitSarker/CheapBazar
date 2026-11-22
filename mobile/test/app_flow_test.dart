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
import 'package:cheapbazar/state/session.dart';

http.Response j(Object body, [int s = 200]) => http.Response(jsonEncode(body), s, headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, dynamic> product(String id, String name, num price) => {
      'productId': id, 'name': name, 'description': 'Tasty $name', 'image': null,
      'store': {'id': 's1', 'slug': 'bakery', 'name': 'Demo Bakery'}, 'inStock': true, 'price': price, 'stock': 9,
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('shop -> add to bag -> checkout (COD) -> order placed', (tester) async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    Map<String, dynamic>? orderBody;
    String? idemKey;

    final client = MockClient((req) async {
      final path = req.url.path.replaceFirst('/api/m/v1', '');
      if (path == '/config') return j({'minAppVersion': '1.0.0', 'currency': 'BDT'});
      if (path == '/home') {
        return j({
          'ads': [],
          'stores': [{'slug': 'bakery', 'name': 'Demo Bakery', 'productCount': 2, 'sampleProducts': []}],
          'items': [product('p1', 'Sourdough', 450), product('p2', 'Croissant', 120)],
        });
      }
      if (path == '/browse') {
        return j({'tab': 'retail', 'items': [product('p1', 'Sourdough', 450)], 'total': 1, 'page': 1, 'pages': 1, 'paywall': null, 'ads': []});
      }
      if (path == '/orders' && req.method == 'POST') {
        orderBody = jsonDecode(req.body) as Map<String, dynamic>;
        idemKey = req.headers['idempotency-key'];
        return j({
          'order': {
            'id': 'o1', 'orderNumber': 'ORD-TEST0001', 'storeName': 'Demo Bakery', 'storeSlug': 'bakery', 'orderType': 'RETAIL',
            'paymentMethod': 'COD', 'status': 'CONFIRMED', 'totalAmount': 900, 'createdAt': '2026-11-11T10:00:00Z',
            'buyerName': 'Rahat', 'buyerPhone': '01712345678', 'shippingAddress': 'Road 5', 'shippingCity': 'Dhaka',
            'items': [{'productId': 'p1', 'name': 'Sourdough', 'quantity': 2, 'unitPrice': 450, 'lineTotal': 900}], 'canCancel': true,
          }
        });
      }
      return j({'error': 'not mocked: $path', 'code': 'NOT_FOUND'}, 404);
    });

    final api = ApiClient(baseUrl: 'https://shop.test', client: client);
    final session = SessionController(api);
    final cart = CartController();
    final locale = LocaleController();
    await tester.binding.setSurfaceSize(const Size(420, 900));
    await tester.pumpWidget(CheapBazarApp(api: api, session: session, cart: cart, locale: locale));
    await tester.pumpAndSettle();

    // Home shows the shop and the fresh picks
    expect(find.text('Demo Bakery'), findsWidgets);
    expect(find.text('Sourdough'), findsWidgets);

    // open a product from Home and add 2 to the bag
    await tester.tap(find.text('Sourdough').first);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Zi.add));
    await tester.pump();
    await tester.tap(find.text('Add to bag'));
    await tester.pumpAndSettle();
    expect(cart.count, 2);

    // Bag tab -> checkout
    await tester.tap(find.text('Bag').last);
    await tester.pumpAndSettle();
    expect(find.text('Demo Bakery'), findsWidgets);
    await tester.tap(find.textContaining('Checkout ·'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'Full name'), 'Rahat');
    await tester.enterText(find.widgetWithText(TextFormField, 'Mobile number'), '01712345678');
    await tester.enterText(find.widgetWithText(TextFormField, 'Delivery address'), 'Road 5');
    await tester.ensureVisible(find.textContaining('Place order'));
    await tester.tap(find.textContaining('Place order'));
    await tester.pumpAndSettle();

    expect(find.text('Order placed!'), findsOneWidget);
    expect(find.text('ORD-TEST0001'), findsOneWidget);
    expect(orderBody!['storeSlug'], 'bakery');
    expect(orderBody!['orderType'], 'RETAIL');
    expect(orderBody!['items'], [{'productId': 'p1', 'quantity': 2}]);
    expect(orderBody!['buyer']['phone'], '01712345678');
    expect(idemKey, isNotNull);
    expect(cart.isEmpty, true, reason: 'the ordered group leaves the bag');
  });

  testWidgets('language switch to Bangla relabels the tabs', (tester) async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    final client = MockClient((req) async {
      final path = req.url.path.replaceFirst('/api/m/v1', '');
      if (path == '/home') return j({'ads': [], 'stores': [], 'items': []});
      if (path == '/config') return j({'minAppVersion': '1.0.0'});
      return j({'error': 'x'}, 404);
    });
    final api = ApiClient(baseUrl: 'https://shop.test', client: client);
    final locale = LocaleController();
    await tester.binding.setSurfaceSize(const Size(420, 900));
    await tester.pumpWidget(CheapBazarApp(api: api, session: SessionController(api), cart: CartController(), locale: locale));
    await tester.pumpAndSettle();
    expect(find.text('Account'), findsOneWidget);
    await locale.set('bn');
    await tester.pumpAndSettle();
    expect(find.text('অ্যাকাউন্ট'), findsOneWidget);
    expect(find.text('Account'), findsNothing);
  });
}
