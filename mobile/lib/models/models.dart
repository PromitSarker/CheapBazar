double _d(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
String _s(dynamic v) => v == null ? '' : '$v';

class PriceTier {
  PriceTier(this.minQty, this.unitPrice);
  final int minQty;
  final double unitPrice;
  factory PriceTier.fromJson(Map<String, dynamic> j) => PriceTier(_i(j['minQty']), _d(j['unitPrice']));
}

/// One sellable product, from the marketplace search or a storefront.
class Product {
  Product({
    required this.id,
    required this.name,
    required this.description,
    required this.image,
    required this.storeSlug,
    required this.storeName,
    required this.price,
    required this.stock,
    required this.inStock,
    this.locked = false,
    this.wholesalePrice,
    this.moq = 1,
    this.tiers = const [],
    this.wholesale = false,
    this.images = const [],
    this.categoryId,
    this.brand,
    this.unit,
    this.compareAtPrice,
    this.discountPct = 0,
    this.distanceKm,
  });

  final String id;
  final String name;
  final String description;
  final String? image;
  final String storeSlug;
  final String storeName;
  final double price; // retail price (0 when hidden by the wholesale paywall)
  final int stock;
  final bool inStock;
  final bool locked; // wholesale prices hidden: login / Buyer Pro needed
  final double? wholesalePrice;
  final int moq;
  final List<PriceTier> tiers;
  final bool wholesale;
  final List<String> images; // gallery; [image] is the cover
  final String? categoryId;
  /// How far the shop is from the buyer (km), when the buyer's position is known.
  final double? distanceKm;
  final String? brand;
  final String? unit; // pack size, e.g. "500 g"
  final double? compareAtPrice; // crossed-out "was" price (retail only)
  final int discountPct;

  /// A real retail discount: never shown for wholesale/locked items or when the "was" price is not higher.
  bool get onSale => !wholesale && !locked && compareAtPrice != null && compareAtPrice! > price;

  /// Cover first, then the rest; falls back to the single [image].
  List<String> get gallery => images.isNotEmpty ? images : (image != null && image!.isNotEmpty ? [image!] : const []);

  /// "Brand · 500 g" (either part may be missing).
  String get subtitle => [if ((brand ?? '').isNotEmpty) brand!, if ((unit ?? '').isNotEmpty) unit!].join(' · ');

  double get unitPrice => wholesale ? (wholesalePrice ?? price) : price;

  /// Wholesale unit price for [qty], honouring volume tiers.
  double unitPriceFor(int qty) {
    if (!wholesale) return price;
    var best = wholesalePrice ?? price;
    for (final t in tiers) {
      if (qty >= t.minQty && t.unitPrice < best) best = t.unitPrice;
    }
    return best;
  }

  factory Product.fromBrowse(Map<String, dynamic> j, {bool wholesale = false}) {
    final store = (j['store'] as Map?)?.cast<String, dynamic>() ?? const {};
    final stock = _i(j['stock']);
    return Product(
      id: _s(j['productId']),
      name: _s(j['name']),
      description: _s(j['description']),
      image: j['image'] as String?,
      storeSlug: _s(store['slug']),
      storeName: _s(store['name']),
      price: _d(j['price']),
      stock: stock,
      inStock: j['inStock'] == true || stock > 0,
      locked: j['locked'] == true,
      wholesalePrice: j['wholesalePrice'] == null ? null : _d(j['wholesalePrice']),
      moq: j['moq'] == null ? 1 : _i(j['moq']).clamp(1, 1000000),
      tiers: ((j['tiers'] as List?) ?? const []).map((e) => PriceTier.fromJson((e as Map).cast<String, dynamic>())).toList(),
      wholesale: wholesale,
      images: ((j['images'] as List?) ?? const []).map((e) => _s(e)).where((e) => e.isNotEmpty).toList(),
      categoryId: j['categoryId'] as String?,
      brand: j['brand'] as String?,
      unit: j['unit'] as String?,
      compareAtPrice: j['compareAtPrice'] == null ? null : _d(j['compareAtPrice']),
      discountPct: _i(j['discountPct']),
      distanceKm: (store['distanceKm'] as num?)?.toDouble(),
    );
  }

  factory Product.fromStore(Map<String, dynamic> j, String storeSlug, String storeName) {
    final stock = _i(j['stock']);
    return Product(
      id: _s(j['id']),
      name: _s(j['name']),
      description: _s(j['description']),
      image: j['image'] as String?,
      storeSlug: storeSlug,
      storeName: storeName,
      price: _d(j['price']),
      stock: stock,
      inStock: stock > 0,
    );
  }
}

/// A department or sub-category (admin-managed). [count] = products currently listed in it.
class ShopCategory {
  ShopCategory({required this.id, required this.parentId, required this.nameEn, required this.nameBn, required this.icon, required this.count, this.imageUrl = '', this.children = const []});
  final String id;
  final String? parentId;
  final String nameEn;
  final String nameBn;
  final String icon; // Material icon key, see category_icons.dart
  final String imageUrl; // optional cutout photo (absolute or /uploads path); empty = tinted icon fallback
  final int count;
  final List<ShopCategory> children;

  String name(bool bn) => bn && nameBn.isNotEmpty ? nameBn : nameEn;

  factory ShopCategory.fromJson(Map<String, dynamic> j) => ShopCategory(
        id: _s(j['id']),
        parentId: j['parentId'] as String?,
        nameEn: _s(j['nameEn']),
        nameBn: _s(j['nameBn']),
        icon: _s(j['icon']),
        count: _i(j['count']),
        imageUrl: _s(j['imageUrl'] ?? j['image']),
        children: ((j['children'] as List?) ?? const []).map((e) => ShopCategory.fromJson((e as Map).cast<String, dynamic>())).toList(),
      );
}

/// A horizontal product row on Home ("Deals & offers", "New arrivals", a busy department...).
class Shelf {
  Shelf({required this.key, required this.titleEn, required this.titleBn, required this.categoryId, required this.onSale, required this.items});
  final String key;
  final String titleEn;
  final String titleBn;
  final String? categoryId;
  final bool onSale;
  final List<Product> items;

  String title(bool bn) => bn && titleBn.isNotEmpty ? titleBn : titleEn;

  factory Shelf.fromJson(Map<String, dynamic> j) {
    final t = (j['title'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Shelf(
      key: _s(j['key']),
      titleEn: _s(t['en']),
      titleBn: _s(t['bn']),
      categoryId: j['categoryId'] as String?,
      onSale: j['onSale'] == true,
      items: ((j['items'] as List?) ?? const []).map((e) => Product.fromBrowse((e as Map).cast<String, dynamic>())).toList(),
    );
  }
}

class StoreCardData {
  StoreCardData({required this.slug, required this.name, required this.productCount, required this.samples, this.distanceKm});
  final double? distanceKm;
  final String slug;
  final String name;
  final int productCount;
  final List<String> samples;
  factory StoreCardData.fromJson(Map<String, dynamic> j) => StoreCardData(
        slug: _s(j['slug']),
        name: _s(j['name']),
        productCount: _i(j['productCount']),
        samples: ((j['sampleProducts'] as List?) ?? const []).map((e) => _s((e as Map)['name'])).toList(),
        distanceKm: (j['distanceKm'] as num?)?.toDouble(),
      );
}

class AdBanner {
  AdBanner({required this.headline, required this.imageUrl, required this.targetUrl});
  final String headline;
  final String imageUrl;
  final String targetUrl;
  factory AdBanner.fromJson(Map<String, dynamic> j) =>
      AdBanner(headline: _s(j['headline']), imageUrl: _s(j['imageUrl']), targetUrl: _s(j['targetUrl']));

  /// `/store/<slug>` targets open inside the app.
  String? get storeSlug {
    final m = RegExp(r'^/store/([A-Za-z0-9-]+)').firstMatch(targetUrl);
    return m?.group(1);
  }
}

class OrderItem {
  OrderItem({required this.productId, required this.name, required this.quantity, required this.unitPrice, required this.lineTotal});
  final String productId;
  final String name;
  final int quantity;
  final double unitPrice;
  final double lineTotal;
  factory OrderItem.fromJson(Map<String, dynamic> j) => OrderItem(
        productId: _s(j['productId']),
        name: _s(j['name']),
        quantity: _i(j['quantity']),
        unitPrice: _d(j['unitPrice']),
        lineTotal: _d(j['lineTotal']),
      );
}

class Order {
  Order({
    required this.id,
    required this.orderNumber,
    required this.storeName,
    required this.storeSlug,
    required this.orderType,
    required this.paymentMethod,
    required this.status,
    required this.totalAmount,
    required this.createdAt,
    required this.trackingNumber,
    required this.courierName,
    required this.shippingAddress,
    required this.shippingCity,
    required this.buyerName,
    required this.buyerPhone,
    required this.items,
    required this.canCancel,
  });
  final String id;
  final String orderNumber;
  final String storeName;
  final String storeSlug;
  final String orderType;
  final String paymentMethod;
  final String status;
  final double totalAmount;
  final DateTime? createdAt;
  final String? trackingNumber;
  final String? courierName;
  final String shippingAddress;
  final String shippingCity;
  final String buyerName;
  final String buyerPhone;
  final List<OrderItem> items;
  final bool canCancel;

  factory Order.fromJson(Map<String, dynamic> j) => Order(
        id: _s(j['id']),
        orderNumber: _s(j['orderNumber']),
        storeName: _s(j['storeName']),
        storeSlug: _s(j['storeSlug']),
        orderType: _s(j['orderType']),
        paymentMethod: _s(j['paymentMethod']),
        status: _s(j['status']),
        totalAmount: _d(j['totalAmount']),
        createdAt: DateTime.tryParse(_s(j['createdAt']))?.toLocal(),
        trackingNumber: j['trackingNumber'] as String?,
        courierName: j['courierName'] as String?,
        shippingAddress: _s(j['shippingAddress']),
        shippingCity: _s(j['shippingCity']),
        buyerName: _s(j['buyerName']),
        buyerPhone: _s(j['buyerPhone']),
        items: ((j['items'] as List?) ?? const []).map((e) => OrderItem.fromJson((e as Map).cast<String, dynamic>())).toList(),
        canCancel: j['canCancel'] == true,
      );
}

class AppNotification {
  AppNotification({required this.id, required this.kind, required this.title, required this.body, required this.link, required this.read, required this.createdAt});
  final String id;
  final String kind;
  final String title;
  final String body;
  final String? link;
  final bool read;
  final DateTime? createdAt;
  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: _s(j['id']),
        kind: _s(j['kind']),
        title: _s(j['title']),
        body: _s(j['body']),
        link: j['link'] as String?,
        read: j['read'] == true,
        createdAt: DateTime.tryParse(_s(j['createdAt']))?.toLocal(),
      );
}

class AppUser {
  AppUser({required this.id, required this.email, required this.name, required this.role});
  final String id;
  final String email;
  final String name;
  final String role;
  bool get isBuyer => role == 'BUYER' || role == 'PRO_BUYER';
  factory AppUser.fromJson(Map<String, dynamic> j) =>
      AppUser(id: _s(j['id']), email: _s(j['email']), name: _s(j['name']), role: _s(j['role']));
}

class ProStatus {
  ProStatus({required this.active, required this.status, required this.currentPeriodEnd});
  final bool active;
  final String status;
  final DateTime? currentPeriodEnd;
  factory ProStatus.fromJson(Map<String, dynamic> j) => ProStatus(
        active: j['active'] == true,
        status: _s(j['status']),
        currentPeriodEnd: DateTime.tryParse(_s(j['currentPeriodEnd']))?.toLocal(),
      );
}

class ProPlan {
  ProPlan({required this.name, required this.price, required this.periodDays});
  final String name;
  final double price;
  final int periodDays;
  factory ProPlan.fromJson(Map<String, dynamic> j) => ProPlan(name: _s(j['name']), price: _d(j['price']), periodDays: _i(j['periodDays']));
}

class ProPayment {
  ProPayment({required this.method, required this.trxId, required this.amount, required this.status});
  final String method;
  final String trxId;
  final double amount;
  final String status;
  factory ProPayment.fromJson(Map<String, dynamic> j) =>
      ProPayment(method: _s(j['method']), trxId: _s(j['trxId']), amount: _d(j['amount']), status: _s(j['status']));
}
