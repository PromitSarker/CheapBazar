import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cheapbazar/api/api_client.dart';
import 'package:cheapbazar/models/models.dart';
import 'package:cheapbazar/models/pay_info.dart';
import 'package:cheapbazar/state/cart.dart';
import 'package:cheapbazar/state/l10n.dart';
import 'package:cheapbazar/state/session.dart';
import 'package:cheapbazar/ui/screens/checkout_screen.dart';
import 'package:cheapbazar/ui/screens/order_detail_screen.dart';

http.Response j(Object body, [int s = 200]) => http.Response(jsonEncode(body), s, headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, dynamic> orderJson({String type = 'RETAIL', String status = 'CONFIRMED'}) => {
      'id': 'o1', 'orderNumber': 'ORD-TEST0001', 'storeName': 'Demo Bakery', 'storeSlug': 'bakery', 'orderType': type,
      'paymentMethod': 'COD', 'status': status, 'totalAmount': 900, 'createdAt': '2026-11-11T10:00:00Z',
      'buyerName': 'Rahat', 'buyerPhone': '01712345678', 'shippingAddress': 'Road 5', 'shippingCity': 'Dhaka',
      'items': [{'productId': 'p1', 'name': 'Sourdough', 'quantity': 2, 'unitPrice': 450, 'lineTotal': 900}], 'canCancel': true,
    };

const fullPay = {
  'store': {'name': 'Demo Bakery', 'slug': 'bakery'},
  'bkash': '01712345678', 'nagad': '01912345678', 'rocket': null, 'banglaQrUrl': '/uploads/qr.png', 'available': true,
};

class Harness {
  Harness(this.pay, {bool signedIn = true, this.payStatus = 200}) {
    client = MockClient((req) async {
      final path = req.url.path.replaceFirst('/api/m/v1', '');
      if (path == '/stores/bakery/pay') {
        payCalls++;
        return payStatus == 200 ? j(pay) : j({'error': 'nope', 'code': 'X'}, payStatus);
      }
      if (path == '/orders' && req.method == 'POST') {
        orderBody = jsonDecode(req.body) as Map<String, dynamic>;
        return j({'order': orderJson()});
      }
      return j({'error': 'not mocked: $path', 'code': 'NOT_FOUND'}, 404);
    });
    api = ApiClient(baseUrl: 'https://shop.test', client: client);
    session = SessionController(api);
    if (signedIn) session.user = AppUser(id: 'u1', email: 'a@b.c', name: 'Rahat', role: 'BUYER');
  }
  final Map<String, dynamic> pay;
  final int payStatus;
  late final MockClient client;
  late final ApiClient api;
  late final SessionController session;
  final cart = CartController();
  final locale = LocaleController();
  int payCalls = 0;
  Map<String, dynamic>? orderBody;

  Widget host(Widget child) => MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: api),
          ChangeNotifierProvider<SessionController>.value(value: session),
          ChangeNotifierProvider<CartController>.value(value: cart),
          ChangeNotifierProvider<LocaleController>.value(value: locale),
        ],
        child: MaterialApp(home: child),
      );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('PayInfo: only the set numbers, in a fixed order; empty means unavailable', () {
    final i = PayInfo.fromJson(fullPay);
    expect(i.numbers.map((e) => e.key).toList(), ['bKash', 'Nagad']);
    expect(i.hasQr, isTrue);
    expect(i.available, isTrue);
    expect(PayInfo.fromJson({'store': {'name': 'x'}, 'bkash': '  ', 'nagad': null}).available, isFalse);
    expect(PayInfo.fromJson({'banglaQrUrl': '/uploads/q.png'}).available, isTrue);
  });

  test('only open RETAIL orders can be paid directly', () {
    expect(canPayDirectly(orderType: 'RETAIL', status: 'CONFIRMED'), isTrue);
    expect(canPayDirectly(orderType: 'RETAIL', status: 'SHIPPED'), isTrue);
    expect(canPayDirectly(orderType: 'RETAIL', status: 'DELIVERED'), isFalse);
    expect(canPayDirectly(orderType: 'RETAIL', status: 'CANCELLED'), isFalse);
    expect(canPayDirectly(orderType: 'WHOLESALE', status: 'CONFIRMED'), isFalse);
  });

  testWidgets('order details: Pay now opens the pop-up with numbers, QR, amount and the order number as reference', (tester) async {
    final h = Harness(fullPay);
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    await tester.binding.setSurfaceSize(const Size(420, 900));
    await tester.pumpWidget(h.host(OrderDetailScreen(order: Order.fromJson(orderJson()))));
    await tester.pumpAndSettle();

    expect(find.text('Pay now'), findsOneWidget);
    await tester.tap(find.text('Pay now'));
    await tester.pumpAndSettle();

    expect(find.text('Pay the seller directly'), findsOneWidget);
    expect(find.text('bKash'), findsOneWidget);
    expect(find.text('01712 345678'), findsOneWidget, reason: 'shown grouped for reading');
    expect(find.text('Nagad'), findsOneWidget);
    expect(find.text('Rocket'), findsNothing, reason: 'unset numbers are hidden');
    expect(find.text('Scan Bangla QR'), findsOneWidget);
    expect(find.textContaining('ORD-TEST0001'), findsWidgets, reason: 'the order number is the payment reference');
    expect(find.textContaining('does not process or check'), findsOneWidget);

    await tester.tap(find.text('Copy').first);
    await tester.pump();
    expect(copied, '01712345678', reason: 'the raw number is copied, without the reading space');
  });

  testWidgets('Pay now is hidden when it must be: nothing set up, signed out, cancelled, wholesale, or the lookup fails', (tester) async {
    await tester.binding.setSurfaceSize(const Size(420, 900));

    final empty = Harness({'store': {'name': 'Demo Bakery', 'slug': 'bakery'}, 'bkash': null, 'nagad': null, 'rocket': null, 'banglaQrUrl': null, 'available': false});
    await tester.pumpWidget(empty.host(OrderDetailScreen(order: Order.fromJson(orderJson()))));
    await tester.pumpAndSettle();
    expect(find.text('Pay now'), findsNothing);
    expect(empty.payCalls, 1);

    final out = Harness(fullPay, signedIn: false);
    await tester.pumpWidget(out.host(OrderDetailScreen(order: Order.fromJson(orderJson()))));
    await tester.pumpAndSettle();
    expect(find.text('Pay now'), findsNothing);
    expect(out.payCalls, 0, reason: 'guests never ask for the numbers');

    final cancelled = Harness(fullPay);
    await tester.pumpWidget(cancelled.host(OrderDetailScreen(order: Order.fromJson(orderJson(status: 'CANCELLED')))));
    await tester.pumpAndSettle();
    expect(find.text('Pay now'), findsNothing);
    expect(cancelled.payCalls, 0);

    final wholesale = Harness(fullPay);
    await tester.pumpWidget(wholesale.host(OrderDetailScreen(order: Order.fromJson(orderJson(type: 'WHOLESALE')))));
    await tester.pumpAndSettle();
    expect(find.text('Pay now'), findsNothing);
    expect(wholesale.payCalls, 0, reason: 'retail only');

    final broken = Harness(fullPay, payStatus: 500);
    await tester.pumpWidget(broken.host(OrderDetailScreen(order: Order.fromJson(orderJson()))));
    await tester.pumpAndSettle();
    expect(find.text('Pay now'), findsNothing, reason: 'a failed lookup is silent and never blocks the order screen');
    expect(find.text('ORD-TEST0001'), findsWidgets);
  });

  CartGroup group() => CartGroup('bakery', 'Demo Bakery', 'RETAIL', [
        CartLine(productId: 'p1', name: 'Sourdough', image: null, storeSlug: 'bakery', storeName: 'Demo Bakery', orderType: 'RETAIL', unitPrice: 450, quantity: 2, maxStock: 9, moq: 1, wholesalePrice: null, tiers: const []),
      ]);

  testWidgets('checkout: choosing "pay the seller directly" places a normal order, then the pay pop-up opens by itself', (tester) async {
    final h = Harness(fullPay);
    await tester.binding.setSurfaceSize(const Size(420, 1400));
    await tester.pumpWidget(h.host(CheckoutScreen(group: group())));
    await tester.pumpAndSettle();

    expect(find.text('How will you pay?'), findsOneWidget);
    expect(find.text('Cash on delivery'), findsOneWidget);
    await tester.tap(find.text('Pay the seller directly'));
    await tester.pump();

    await tester.enterText(find.byType(TextFormField).at(0), 'Rahat');
    await tester.enterText(find.byType(TextFormField).at(1), '01712345678');
    await tester.enterText(find.byType(TextFormField).at(2), 'Road 5, Dhanmondi');
    await tester.tap(find.textContaining('Place order'));
    await tester.pumpAndSettle();

    // the order is exactly the usual COD order: no new fields, nothing about payment is sent
    expect(h.orderBody, isNotNull);
    expect(h.orderBody!.containsKey('paymentMethod'), isFalse);
    expect(h.orderBody!['orderType'], 'RETAIL');
    // and the pop-up is already open on the success screen
    expect(find.text('Pay the seller directly'), findsWidgets);
    expect(find.text('01712 345678'), findsOneWidget);
    expect(find.textContaining('ORD-TEST0001'), findsWidgets);
  });

  testWidgets('checkout: no choice is offered when the seller has not set up direct payment', (tester) async {
    final h = Harness({'store': {'name': 'Demo Bakery', 'slug': 'bakery'}, 'bkash': null, 'nagad': null, 'rocket': null, 'banglaQrUrl': null, 'available': false});
    await tester.binding.setSurfaceSize(const Size(420, 1400));
    await tester.pumpWidget(h.host(CheckoutScreen(group: group())));
    await tester.pumpAndSettle();
    expect(find.text('How will you pay?'), findsNothing);
    expect(find.textContaining('Cash on Delivery'), findsOneWidget, reason: 'the usual COD note stays');
  });
}
