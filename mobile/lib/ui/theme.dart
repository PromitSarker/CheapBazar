import 'package:flutter/material.dart';

// Cheap-Bazar palette: deep evergreen + electric lime, mint surfaces, coral for sales.
const Color kBrand = Color(0xFF123B32); // deep evergreen: app bar text, cart bar, brand
const Color kInk = Color(0xFF24332D); // charcoal green: headings / body
const Color kLime = Color(0xFFC9F36A); // primary CTA fill (label is always kBrand)
const Color kLimePressed = Color(0xFFB4E04A);
const Color kMint = Color(0xFFEAF4EC);
const Color kWarmWhite = Color(0xFFFAFAF5);
const Color kAccent = Color(0xFF1E7A57); // readable green for text/icons on light

// Catalogue tokens.
const Color kAction = Color(0xFF1E7A57);
const Color kActionSoft = Color(0xFFEAF4EC);
const Color kSale = Color(0xFFFF795E); // coral: always pair with dark (kInk) text
const Color kMuted = Color(0xFF5C6B64);
const Color kLine = Color(0xFFE2E8DC);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: kBrand, brightness: Brightness.light).copyWith(
    primary: kBrand,
    onPrimary: Colors.white,
    primaryContainer: kLime,
    onPrimaryContainer: kBrand,
    secondary: kAccent,
    secondaryContainer: kMint,
    onSecondaryContainer: kBrand,
    surface: Colors.white,
    onSurface: kInk,
    outline: kLine,
    error: const Color(0xFFC62F2F),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: kWarmWhite,
    appBarTheme: const AppBarTheme(
      backgroundColor: kWarmWhite,
      surfaceTintColor: Colors.transparent,
      foregroundColor: kBrand,
      elevation: 0,
      scrolledUnderElevation: 1,
      centerTitle: false,
      titleTextStyle: TextStyle(color: kBrand, fontSize: 20, fontWeight: FontWeight.w700),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: kLine)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kLime,
        foregroundColor: kBrand,
        disabledBackgroundColor: const Color(0xFFE2E8DC),
        disabledForegroundColor: kMuted,
        side: const BorderSide(color: kBrand, width: 1),
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ).copyWith(
        overlayColor: WidgetStateProperty.all(kLimePressed.withAlpha(90)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: kBrand,
        minimumSize: const Size.fromHeight(50),
        side: const BorderSide(color: kBrand),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: kAccent)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFC5D0C0))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFC5D0C0))),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: kAccent, width: 1.8)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: kLime,
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? kBrand : kMuted)),
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: s.contains(WidgetState.selected) ? kBrand : kMuted)),
    ),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      checkmarkColor: kBrand,
      side: const BorderSide(color: kLine),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: kAccent),
  );
}
