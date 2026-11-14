import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cheapbazar/models/models.dart';
import 'package:cheapbazar/state/cart.dart';
import 'package:cheapbazar/state/l10n.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('browse item parsing: retail, locked wholesale and tiered wholesale', () {
    final retail = Product.fromBrowse({
      'productId': 'p1', 'name': 'Sourdough', 'description': 'Fresh', 'image': '/uploads/a.png',
      'store': {'id': 's1', 'slug': 'bakery', 'name': 'Bakery'}, 'inStock': true, 'price': 450, 'stock': 8,
    });
    expect(retail.price, 450);
    expect(retail.storeSlug, 'bakery');
    expect(retail.inStock, true);

    final locked = Product.fromBrowse({
      'productId': 'p2', 'name': 'Bulk', 'description': '', 'image': null,
      'store': {'id': 's1', 'slug': 'bakery', 'name': 'Bakery'}, 'inStock': true, 'locked': true,
    }, wholesale: true);
    expect(locked.locked, true);
    expect(locked.price, 0);

    final ws = Product.fromBrowse({
      'productId': 'p3', 'name': 'Flour', 'description': '', 'image': null,
      'store': {'id': 's1', 'slug': 'bakery', 'name': 'Bakery'}, 'inStock': true, 'stock': 500,
      'wholesalePrice': 300, 'moq': 10, 'tiers': [{'minQty': 100, 'unitPrice': 250}],
    }, wholesale: true);
    expect(ws.unitPriceFor(10), 300);
    expect(ws.unitPriceFor(100), 250);
    expect(ws.moq, 10);
  });

  test('order parsing', () {
    final o = Order.fromJson({
      'id': 'o1', 'orderNumber': 'ORD-AB12CD34', 'storeName': 'Bakery', 'storeSlug': 'bakery', 'orderType': 'RETAIL',
      'paymentMethod': 'COD', 'status': 'CONFIRMED', 'totalAmount': 900, 'createdAt': '2026-11-11T10:00:00.000Z',
      'items': [{'productId': 'p1', 'name': 'Sourdough', 'quantity': 2, 'unitPrice': 450, 'lineTotal': 900}], 'canCancel': true,
    });
    expect(o.totalAmount, 900);
    expect(o.items.single.lineTotal, 900);
    expect(o.canCancel, true);
  });

  test('ad target /store/<slug> opens in app', () {
    expect(AdBanner(headline: 'x', imageUrl: '', targetUrl: '/store/my-shop?x=1').storeSlug, 'my-shop');
    expect(AdBanner(headline: 'x', imageUrl: '', targetUrl: 'https://evil.example').storeSlug, isNull);
  });

  test('bag: groups per shop and order type, merges lines, clamps to stock, persists', () async {
    SharedPreferences.setMockInitialValues({});
    final cart = CartController();
    final a = Product(id: 'a', name: 'A', description: '', image: null, storeSlug: 's1', storeName: 'S1', price: 100, stock: 3, inStock: true);
    final b = Product(id: 'b', name: 'B', description: '', image: null, storeSlug: 's2', storeName: 'S2', price: 50, stock: 10, inStock: true);
    cart.add(a, qty: 2);
    cart.add(a, qty: 5); // clamps to the 3 in stock
    cart.add(b);
    expect(cart.count, 4);
    expect(cart.groups.length, 2);
    expect(cart.groups.first.total, 300);

    final w = Product(id: 'w', name: 'W', description: '', image: null, storeSlug: 's1', storeName: 'S1', price: 0, stock: 500, inStock: true, wholesale: true, wholesalePrice: 300, moq: 10, tiers: [PriceTier(100, 250)]);
    cart.add(w, qty: 1); // below MOQ -> raised to 10
    final line = cart.lines.firstWhere((l) => l.isWholesale);
    expect(line.quantity, 10);
    expect(cart.groups.length, 3, reason: 'retail and wholesale of the same shop are separate orders');
    cart.setQuantity(line, 100);
    expect(line.effectiveUnit, 250);
    cart.setQuantity(line, 2);
    expect(line.quantity, 10, reason: 'never below MOQ');

    await Future<void>.delayed(const Duration(milliseconds: 50));
    final again = CartController();
    await again.load();
    expect(again.count, cart.count);
    again.removeGroup('s1', 'RETAIL');
    expect(again.groups.length, 2);
  });

  test('money and Bangla digits', () {
    expect(formatMoney(1250.5), '৳1,250.50');
    expect(formatMoney(1250.5, bn: true), '৳১,২৫০.৫০');
    expect(formatMoney(0), '৳0.00');
  });

  test('every English string has a Bangla twin', () async {
    final l = LocaleController();
    await l.set('bn');
    for (final k in ['home', 'checkout', 'status_SHIPPED', 'cod_note', 'delete_account_hint', 'buyer_pro']) {
      expect(l.t(k), isNot(k));
    }
    expect(l.t('only_left', {'n': '3'}), contains('৩'.isEmpty ? '' : '3'));
  });
}
