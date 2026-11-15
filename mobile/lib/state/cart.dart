import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';

class CartLine {
  CartLine({
    required this.productId,
    required this.name,
    required this.image,
    required this.storeSlug,
    required this.storeName,
    required this.orderType,
    required this.unitPrice,
    required this.quantity,
    required this.maxStock,
    required this.moq,
    required this.wholesalePrice,
    required this.tiers,
  });

  final String productId;
  final String name;
  final String? image;
  final String storeSlug;
  final String storeName;
  final String orderType; // RETAIL | WHOLESALE
  double unitPrice;
  int quantity;
  final int maxStock;
  final int moq;
  final double? wholesalePrice;
  final List<PriceTier> tiers;

  bool get isWholesale => orderType == 'WHOLESALE';
  String get groupKey => '$storeSlug|$orderType';

  /// Unit price at the current quantity (wholesale honours volume tiers; the server re-prices anyway).
  double get effectiveUnit {
    if (!isWholesale) return unitPrice;
    var best = wholesalePrice ?? unitPrice;
    for (final t in tiers) {
      if (quantity >= t.minQty && t.unitPrice < best) best = t.unitPrice;
    }
    return best;
  }

  double get lineTotal => effectiveUnit * quantity;

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'name': name,
        'image': image,
        'storeSlug': storeSlug,
        'storeName': storeName,
        'orderType': orderType,
        'unitPrice': unitPrice,
        'quantity': quantity,
        'maxStock': maxStock,
        'moq': moq,
        'wholesalePrice': wholesalePrice,
        'tiers': tiers.map((t) => {'minQty': t.minQty, 'unitPrice': t.unitPrice}).toList(),
      };

  factory CartLine.fromJson(Map<String, dynamic> j) => CartLine(
        productId: '${j['productId']}',
        name: '${j['name']}',
        image: j['image'] as String?,
        storeSlug: '${j['storeSlug']}',
        storeName: '${j['storeName']}',
        orderType: '${j['orderType']}',
        unitPrice: (j['unitPrice'] as num).toDouble(),
        quantity: (j['quantity'] as num).toInt(),
        maxStock: (j['maxStock'] as num?)?.toInt() ?? 9999,
        moq: (j['moq'] as num?)?.toInt() ?? 1,
        wholesalePrice: (j['wholesalePrice'] as num?)?.toDouble(),
        tiers: ((j['tiers'] as List?) ?? const []).map((e) => PriceTier.fromJson((e as Map).cast<String, dynamic>())).toList(),
      );
}

class CartGroup {
  CartGroup(this.storeSlug, this.storeName, this.orderType, this.lines);
  final String storeSlug;
  final String storeName;
  final String orderType;
  final List<CartLine> lines;
  double get total => lines.fold(0.0, (a, l) => a + l.lineTotal);
  int get count => lines.fold(0, (a, l) => a + l.quantity);
}

/// The shopping bag. One checkout (= one order) per shop and order type; persisted on the device.
class CartController extends ChangeNotifier {
  final List<CartLine> _lines = [];
  List<CartLine> get lines => List.unmodifiable(_lines);
  int get count => _lines.fold(0, (a, l) => a + l.quantity);
  bool get isEmpty => _lines.isEmpty;

  /// Everything in the bag across shops (what the sticky bar shows).
  double get total => _lines.fold(0.0, (a, l) => a + l.lineTotal);

  CartLine? lineFor(String productId, {String type = 'RETAIL'}) {
    for (final l in _lines) {
      if (l.productId == productId && l.orderType == type) return l;
    }
    return null;
  }

  int quantityOf(String productId, {String type = 'RETAIL'}) => lineFor(productId, type: type)?.quantity ?? 0;

  /// One less; removes the line at zero (the "-" on a product card).
  void decrement(String productId, {String type = 'RETAIL'}) {
    final l = lineFor(productId, type: type);
    if (l == null) return;
    if (l.quantity <= 1) {
      remove(l);
    } else {
      setQuantity(l, l.quantity - 1);
    }
  }

  List<CartGroup> get groups {
    final map = <String, CartGroup>{};
    for (final l in _lines) {
      map.putIfAbsent(l.groupKey, () => CartGroup(l.storeSlug, l.storeName, l.orderType, [])).lines.add(l);
    }
    return map.values.toList();
  }

  Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString('cart_v1');
      if (raw != null) {
        final list = jsonDecode(raw) as List;
        _lines
          ..clear()
          ..addAll(list.map((e) => CartLine.fromJson((e as Map).cast<String, dynamic>())));
      }
    } catch (_) {
      _lines.clear();
    }
    notifyListeners();
  }

  Future<void> _save() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString('cart_v1', jsonEncode(_lines.map((l) => l.toJson()).toList()));
    } catch (_) {}
  }

  /// Adds [qty] of [p]; returns false when stock does not allow it.
  bool add(Product p, {int qty = 1}) {
    final type = p.wholesale ? 'WHOLESALE' : 'RETAIL';
    final minQty = p.wholesale ? p.moq : 1;
    final idx = _lines.indexWhere((l) => l.productId == p.id && l.orderType == type);
    if (idx >= 0) {
      final l = _lines[idx];
      l.quantity = (l.quantity + qty).clamp(1, l.maxStock < 1 ? 1 : l.maxStock);
    } else {
      final q = qty < minQty ? minQty : qty;
      _lines.add(CartLine(
        productId: p.id,
        name: p.name,
        image: p.image,
        storeSlug: p.storeSlug,
        storeName: p.storeName,
        orderType: type,
        unitPrice: p.unitPrice,
        quantity: p.stock > 0 ? q.clamp(1, p.stock) : q,
        maxStock: p.stock > 0 ? p.stock : 9999,
        moq: minQty,
        wholesalePrice: p.wholesalePrice,
        tiers: p.tiers,
      ));
    }
    _save();
    notifyListeners();
    return true;
  }

  void setQuantity(CartLine l, int q) {
    final min = l.isWholesale ? l.moq : 1;
    l.quantity = q.clamp(min, l.maxStock < min ? min : l.maxStock);
    _save();
    notifyListeners();
  }

  void remove(CartLine l) {
    _lines.remove(l);
    _save();
    notifyListeners();
  }

  void removeGroup(String storeSlug, String orderType) {
    _lines.removeWhere((l) => l.storeSlug == storeSlug && l.orderType == orderType);
    _save();
    notifyListeners();
  }

  void clear() {
    _lines.clear();
    _save();
    notifyListeners();
  }
}
