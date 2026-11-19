import 'package:flutter/widgets.dart';

import 'icons.dart';

/// ShopCategory icons are stored as Material-style icon KEYS by the admin (no image uploads needed); we draw them with Phosphor.
/// Unknown keys fall back to a generic glyph so a new key never crashes the grid.
const Map<String, IconData> _icons = {
  'local_grocery_store': Zi.grocery,
  'checkroom': Zi.fashion,
  'devices': Zi.devices,
  'home': Zi.home,
  'face': Zi.beauty,
  'child_care': Zi.baby,
  'menu_book': Zi.books,
  'sports_soccer': Zi.sports,
  'card_giftcard': Zi.gift,
  'build': Zi.tools,
  'more_horiz': Zi.more,
  'category': Zi.categories,
  'label_outline': Zi.offer,
  'pets': Zi.pets,
  'restaurant': Zi.food,
  'shopping_bag': Zi.bag,
  'watch': Zi.watch,
  'phone_android': Zi.phone,
  'weekend': Zi.furniture,
  'park': Zi.garden,
  'local_florist': Zi.flower,
  'toys': Zi.toys,
  'directions_car': Zi.car,
  'fitness_center': Zi.fitness,
  'music_note': Zi.music,
  'brush': Zi.art,
  'cake': Zi.cake,
  'local_cafe': Zi.cafe,
};

IconData categoryIcon(String key) => _icons[key] ?? Zi.categories;
