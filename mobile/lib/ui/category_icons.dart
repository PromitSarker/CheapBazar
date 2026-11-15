import 'package:flutter/material.dart';

/// ShopCategory icons are stored as Material icon KEYS by the admin (no image uploads needed).
/// Unknown keys fall back to a generic tag so a new key never crashes the grid.
const Map<String, IconData> _icons = {
  'local_grocery_store': Icons.local_grocery_store_outlined,
  'checkroom': Icons.checkroom_outlined,
  'devices': Icons.devices_outlined,
  'home': Icons.home_outlined,
  'face': Icons.face_retouching_natural_outlined,
  'child_care': Icons.child_care_outlined,
  'menu_book': Icons.menu_book_outlined,
  'sports_soccer': Icons.sports_soccer_outlined,
  'card_giftcard': Icons.card_giftcard_outlined,
  'build': Icons.build_outlined,
  'more_horiz': Icons.more_horiz,
  'category': Icons.category_outlined,
  'label_outline': Icons.label_outline,
  'pets': Icons.pets_outlined,
  'restaurant': Icons.restaurant_outlined,
  'shopping_bag': Icons.shopping_bag_outlined,
  'watch': Icons.watch_outlined,
  'phone_android': Icons.phone_android_outlined,
  'weekend': Icons.weekend_outlined,
  'park': Icons.park_outlined,
  'local_florist': Icons.local_florist_outlined,
  'toys': Icons.toys_outlined,
  'directions_car': Icons.directions_car_outlined,
  'fitness_center': Icons.fitness_center_outlined,
  'music_note': Icons.music_note_outlined,
  'brush': Icons.brush_outlined,
  'cake': Icons.cake_outlined,
  'local_cafe': Icons.local_cafe_outlined,
};

IconData categoryIcon(String key) => _icons[key] ?? Icons.category_outlined;
