import 'package:flutter/widgets.dart';

/// The app's icon set: Phosphor Icons (MIT licence, https://phosphoricons.com), "light" weight for a thin, even stroke.
/// The two font files are bundled in assets/fonts and declared in pubspec.yaml (families PhosphorLight, PhosphorRegular).
/// Selected states use the "regular" weight of the same glyph instead of a filled shape.
/// One place to change an icon; screens never reach for Material `Icons` directly.
class Zi {
  Zi._();

  // navigation
  static const IconData home = IconData(0xe2c2, fontFamily: 'PhosphorLight');
  static const IconData homeOn = IconData(0xe2c2, fontFamily: 'PhosphorRegular');
  static const IconData categories = IconData(0xe464, fontFamily: 'PhosphorLight');
  static const IconData categoriesOn = IconData(0xe464, fontFamily: 'PhosphorRegular');
  static const IconData bag = IconData(0xe0b0, fontFamily: 'PhosphorLight');
  static const IconData bagOn = IconData(0xe0b0, fontFamily: 'PhosphorRegular');
  static const IconData orders = IconData(0xe3ec, fontFamily: 'PhosphorLight');
  static const IconData ordersOn = IconData(0xe3ec, fontFamily: 'PhosphorRegular');
  static const IconData account = IconData(0xe4c2, fontFamily: 'PhosphorLight');
  static const IconData accountOn = IconData(0xe4c2, fontFamily: 'PhosphorRegular');

  // actions
  static const IconData search = IconData(0xe30c, fontFamily: 'PhosphorLight');
  static const IconData filter = IconData(0xe434, fontFamily: 'PhosphorLight');
  static const IconData sort = IconData(0xe444, fontFamily: 'PhosphorLight');
  static const IconData add = IconData(0xe3d4, fontFamily: 'PhosphorLight');
  static const IconData remove = IconData(0xe32a, fontFamily: 'PhosphorLight');
  static const IconData close = IconData(0xe4f6, fontFamily: 'PhosphorLight');
  static const IconData check = IconData(0xe182, fontFamily: 'PhosphorLight');
  static const IconData checkCircle = IconData(0xe184, fontFamily: 'PhosphorLight');
  static const IconData addCircle = IconData(0xe3d6, fontFamily: 'PhosphorLight');
  static const IconData removeCircle = IconData(0xe32c, fontFamily: 'PhosphorLight');
  static const IconData delete = IconData(0xe4a6, fontFamily: 'PhosphorLight');
  static const IconData more = IconData(0xe1fe, fontFamily: 'PhosphorLight');
  static const IconData all = IconData(0xe1fc, fontFamily: 'PhosphorLight');
  static const IconData chevron = IconData(0xe13a, fontFamily: 'PhosphorLight');
  static const IconData chevronDown = IconData(0xe136, fontFamily: 'PhosphorLight');
  static const IconData radioOff = IconData(0xe18a, fontFamily: 'PhosphorLight');
  static const IconData download = IconData(0xe20c, fontFamily: 'PhosphorLight');
  static const IconData history = IconData(0xe1a0, fontFamily: 'PhosphorLight');
  static const IconData logout = IconData(0xe42a, fontFamily: 'PhosphorLight');
  static const IconData show = IconData(0xe220, fontFamily: 'PhosphorLight');
  static const IconData hide = IconData(0xe224, fontFamily: 'PhosphorLight');

  // status / info
  static const IconData bell = IconData(0xe0ce, fontFamily: 'PhosphorLight');
  static const IconData bellOn = IconData(0xe5e8, fontFamily: 'PhosphorLight');
  static const IconData lock = IconData(0xe2fa, fontFamily: 'PhosphorLight');
  static const IconData info = IconData(0xe2ce, fontFamily: 'PhosphorLight');
  static const IconData offline = IconData(0xe4f2, fontFamily: 'PhosphorLight');
  static const IconData image = IconData(0xe2ca, fontFamily: 'PhosphorLight');
  static const IconData language = IconData(0xe288, fontFamily: 'PhosphorLight');

  // places, shopping, money
  static const IconData store = IconData(0xe470, fontFamily: 'PhosphorLight');
  static const IconData place = IconData(0xe316, fontFamily: 'PhosphorLight');
  static const IconData locate = IconData(0xe1d6, fontFamily: 'PhosphorLight');
  static const IconData pack = IconData(0xe390, fontFamily: 'PhosphorLight');
  static const IconData pro = IconData(0xe616, fontFamily: 'PhosphorLight');
  static const IconData proOn = IconData(0xe616, fontFamily: 'PhosphorRegular');
  static const IconData shipping = IconData(0xe4b4, fontFamily: 'PhosphorLight');
  static const IconData offer = IconData(0xe478, fontFamily: 'PhosphorLight');
  static const IconData payments = IconData(0xe588, fontFamily: 'PhosphorLight');
  static const IconData noResults = IconData(0xe30c, fontFamily: 'PhosphorLight');

  // category glyphs (keys are stored by the admin, see category_icons.dart)
  static const IconData grocery = IconData(0xe964, fontFamily: 'PhosphorLight');
  static const IconData fashion = IconData(0xe7fe, fontFamily: 'PhosphorLight');
  static const IconData devices = IconData(0xeba4, fontFamily: 'PhosphorLight');
  static const IconData beauty = IconData(0xe436, fontFamily: 'PhosphorLight');
  static const IconData baby = IconData(0xe774, fontFamily: 'PhosphorLight');
  static const IconData books = IconData(0xe0e6, fontFamily: 'PhosphorLight');
  static const IconData sports = IconData(0xe716, fontFamily: 'PhosphorLight');
  static const IconData gift = IconData(0xe276, fontFamily: 'PhosphorLight');
  static const IconData tools = IconData(0xe5d4, fontFamily: 'PhosphorLight');
  static const IconData pets = IconData(0xe648, fontFamily: 'PhosphorLight');
  static const IconData food = IconData(0xe262, fontFamily: 'PhosphorLight');
  static const IconData watch = IconData(0xe4e6, fontFamily: 'PhosphorLight');
  static const IconData phone = IconData(0xe1e0, fontFamily: 'PhosphorLight');
  static const IconData furniture = IconData(0xe012, fontFamily: 'PhosphorLight');
  static const IconData garden = IconData(0xe6da, fontFamily: 'PhosphorLight');
  static const IconData flower = IconData(0xe75e, fontFamily: 'PhosphorLight');
  static const IconData toys = IconData(0xe596, fontFamily: 'PhosphorLight');
  static const IconData car = IconData(0xe112, fontFamily: 'PhosphorLight');
  static const IconData fitness = IconData(0xe0b6, fontFamily: 'PhosphorLight');
  static const IconData music = IconData(0xe33c, fontFamily: 'PhosphorLight');
  static const IconData art = IconData(0xe6f0, fontFamily: 'PhosphorLight');
  static const IconData cake = IconData(0xe780, fontFamily: 'PhosphorLight');
  static const IconData cafe = IconData(0xe1c2, fontFamily: 'PhosphorLight');
}
