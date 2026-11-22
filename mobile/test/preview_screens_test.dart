// Renders screens to PNG with real fonts for eyeballing the design (not part of the normal suite: skipped unless PREVIEW_DIR is set).
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cheapbazar/api/api_client.dart';
import 'package:cheapbazar/main.dart';
import 'package:cheapbazar/models/models.dart';
import 'package:cheapbazar/state/cart.dart';
import 'package:cheapbazar/state/l10n.dart';
import 'package:cheapbazar/state/session.dart';

http.Response j(Object body) => http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json; charset=utf-8'});
Map<String, dynamic> item(String id, String name, num price, {num? was, int pct = 0, String? brand, String unit = '1 kg'}) => {
      'productId': id, 'name': name, 'description': 'About $name', 'image': null, 'images': <String>[],
      'store': {'id': 's1', 'slug': 'fresh', 'name': 'Fresh Mart'}, 'inStock': true, 'price': price, 'stock': 9,
      'compareAtPrice': was, 'discountPct': pct, 'brand': brand, 'unit': unit, 'categoryId': 'fruit',
    };

Future<void> loadFont(String family, String file) async {
  final root = Platform.environment['FLUTTER_ROOT'] ?? '${Platform.environment['HOME']}/dev/flutter';
  final path = file.startsWith('assets/') ? file : '$root/bin/cache/artifacts/material_fonts/$file';
  final bytes = await File(path).readAsBytes();
  final loader = FontLoader(family)..addFont(Future.value(ByteData.view(Uint8List.fromList(bytes).buffer)));
  await loader.load();
}

void main() {
  final dir = Platform.environment['PREVIEW_DIR'];
  testWidgets('preview home', (tester) async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await tester.runAsync(() async {
      await loadFont('Roboto', 'Roboto-Regular.ttf');
      await loadFont('Roboto', 'Roboto-Bold.ttf');
      await loadFont('MaterialIcons', 'MaterialIcons-Regular.otf');
      await loadFont('Newsreader', 'assets/fonts/Newsreader.ttf');
      await loadFont('NotoSerifBengali', 'assets/fonts/NotoSerifBengali.ttf');
      await loadFont('PhosphorLight', 'assets/fonts/Phosphor-Light.ttf');
      await loadFont('PhosphorRegular', 'assets/fonts/Phosphor-Regular.ttf');
    });
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    final items = [
      item('p1', 'Red Apple (Kashmiri)', 80, was: 100, pct: 20, brand: 'Orchard'),
      item('p2', 'Miniket Rice Premium', 120),
      item('p3', 'Fresh Milk 1L', 95, brand: 'Pran', unit: '1 L'),
      item('p4', 'Brown Eggs (12 pcs)', 150, was: 170, pct: 12, unit: '12 pcs'),
    ];
    cat(String id, String en, String icon) => {'id': id, 'parentId': null, 'slug': id, 'nameEn': en, 'nameBn': 'শ্রেণি', 'icon': icon, 'count': 4, 'children': <Object>[]};
    final cats = [cat('a', 'Grocery', 'local_grocery_store'), cat('b', 'Fruits', 'eco'), cat('c', 'Dairy', 'egg'), cat('d', 'Fashion', 'checkroom'), cat('e', 'Home', 'home'), cat('f', 'Beauty', 'spa'), cat('g', 'Tech', 'devices')];
    final client = MockClient((req) async {
      final path = req.url.path.replaceFirst('/api/m/v1', '');
      if (path == '/config') return j({'minAppVersion': '1.0.0'});
      if (path == '/categories') return j({'categories': cats});
      if (path == '/ads/config') return j({'admob': {'enabled': false, 'banners': {}}});
      if (path == '/home') {
        return j({'ads': [], 'stores': [{'id': 's1', 'slug': 'fresh', 'name': 'Fresh Mart', 'productCount': 12}], 'items': items, 'categories': cats, 'shelves': [
          {'key': 'new', 'title': {'en': 'New arrivals', 'bn': 'নতুন'}, 'items': items},
          {'key': 'sale', 'title': {'en': 'On sale', 'bn': 'ছাড়'}, 'items': items.reversed.toList()},
        ]});
      }
      return j({});
    });
    final api = ApiClient(client: client, baseUrl: 'http://x.test');
    tester.view.physicalSize = const Size(1080, 3300);
    tester.view.devicePixelRatio = 3;
    final key = GlobalKey();
    final cart = CartController();
    cart.add(Product.fromBrowse(items[0]));
    final locale = LocaleController();
    await tester.pumpWidget(RepaintBoundary(key: key, child: CheapBazarApp(api: api, session: SessionController(api), cart: cart, locale: locale)));
    for (var i = 0; i < 8; i++) { await tester.pump(const Duration(milliseconds: 300)); }
    Future<void> shot(String name) => tester.runAsync(() async {
          final b = key.currentContext!.findRenderObject() as RenderRepaintBoundary;
          final img = await b.toImage(pixelRatio: 1);
          final data = await img.toByteData(format: ui.ImageByteFormat.png);
          await File('$dir/$name.png').writeAsBytes(data!.buffer.asUint8List());
        });
    await shot('home_en');
    Future<void> settle() async { for (var i = 0; i < 6; i++) { await tester.pump(const Duration(milliseconds: 250)); } }
    await tester.tap(find.text('Red Apple (Kashmiri)').first);
    await settle();
    await shot('product');
    await tester.pageBack();
    await settle();
    for (final tab in ['Categories', 'Bag', 'Account']) {
      await tester.tap(find.text(tab).last);
      await settle();
      await shot('tab_${tab.toLowerCase()}');
    }
    await locale.set('bn');
    for (var i = 0; i < 4; i++) { await tester.pump(const Duration(milliseconds: 300)); }
    await shot('home_bn');
  }, skip: dir == null);
}
