import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';

// Zen / craft palette: warm paper, ink, moss and a single clay accent. Everything is quiet; colour is used sparingly.
// (Names are kept from earlier versions so every screen follows the palette automatically.)
const Color kBrand = Color(0xFF3B4733); // deep moss: primary buttons, selected state
const Color kInk = Color(0xFF2B2A27); // warm near-black: headings / body
const Color kSoftMint = Color(0xFFE4DDCB); // sand: selection / quiet highlight; text on it is always kBrand
const Color kMint = Color(0xFFEFE9DB); // light sand: placeholders, chips at rest
const Color kWarmWhite = Color(0xFFF6F2EA); // paper: page background
const Color kSurface = Color(0xFFFFFDF8); // lighter paper: inputs and raised surfaces (replaces pure white)
const Color kAccent = Color(0xFF56653F); // moss for text/icons on paper (5.3:1)

// Catalogue tokens.
const Color kAction = Color(0xFF56653F);
const Color kActionSoft = Color(0xFFEAE6D6);
const Color kSale = Color(0xFFF0D9CB); // soft clay tint: sale badges (text on it is kClay or kInk)
const Color kClay = Color(0xFFA5593B); // clay: sale prices and the one accent (4.7:1 on paper)
const Color kMuted = Color(0xFF6B665C); // secondary text (5.2:1 on paper)
const Color kLine = Color(0xFFE3DCCD); // hairline
const Color kLineStrong = Color(0xFFCFC6B3); // input borders

/// Latin headings use Newsreader, Bangla headings Noto Serif Bengali. Both are bundled (SIL OFL); body text stays on the system font.
const List<String> kSerifFallback = ['NotoSerifBengali', 'serif'];

/// Quiet serif for titles. Weight is applied both as a font weight and as the variable font's `wght` axis.
TextStyle serif(double size, {double weight = 500, Color? color, double height = 1.25, double letterSpacing = -0.2}) => TextStyle(
      fontFamily: 'Newsreader',
      fontFamilyFallback: kSerifFallback,
      fontSize: size,
      fontWeight: FontWeight.values[((weight / 100).round() - 1).clamp(0, 8)],
      fontVariations: [FontVariation('wght', weight)],
      height: height,
      letterSpacing: letterSpacing,
      color: color ?? kInk,
    );

const double kRadius = 8; // one corner radius for cards, images, buttons, inputs

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: kBrand, brightness: Brightness.light).copyWith(
    primary: kBrand,
    onPrimary: kSurface,
    primaryContainer: kSoftMint,
    onPrimaryContainer: kBrand,
    secondary: kAccent,
    secondaryContainer: kMint,
    onSecondaryContainer: kBrand,
    surface: kSurface,
    onSurface: kInk,
    surfaceContainerHighest: kMint,
    outline: kLineStrong,
    outlineVariant: kLine,
    error: const Color(0xFFB3382C),
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  final text = base.textTheme.apply(bodyColor: kInk, displayColor: kInk);
  return base.copyWith(
    scaffoldBackgroundColor: kWarmWhite,
    textTheme: text.copyWith(
      headlineLarge: serif(30, weight: 500),
      headlineMedium: serif(26, weight: 500),
      headlineSmall: serif(22, weight: 500),
      titleLarge: serif(21, weight: 500),
    ),
    splashFactory: InkRipple.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: kWarmWhite,
      surfaceTintColor: Colors.transparent,
      foregroundColor: kInk,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: serif(22, weight: 500),
    ),
    cardTheme: CardThemeData(
      color: kSurface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius), side: const BorderSide(color: kLine)),
    ),
    dividerTheme: const DividerThemeData(color: kLine, thickness: 1, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kBrand,
        foregroundColor: kSurface,
        disabledBackgroundColor: kLine,
        disabledForegroundColor: kMuted,
        elevation: 0,
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, letterSpacing: 0.2),
      ).copyWith(overlayColor: WidgetStateProperty.all(kSurface.withAlpha(30))),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: kBrand,
        minimumSize: const Size.fromHeight(50),
        side: const BorderSide(color: kLineStrong),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, letterSpacing: 0.2),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: kAccent, textStyle: const TextStyle(fontWeight: FontWeight.w500)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kSurface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(kRadius), borderSide: const BorderSide(color: kLineStrong)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(kRadius), borderSide: const BorderSide(color: kLine)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(kRadius), borderSide: const BorderSide(color: kBrand, width: 1.2)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: kWarmWhite,
      elevation: 0,
      height: 60,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Colors.transparent,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(size: 24, color: s.contains(WidgetState.selected) ? kBrand : kMuted)),
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.2, color: s.contains(WidgetState.selected) ? kBrand : kMuted)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.transparent,
      selectedColor: kActionSoft,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius)),
      checkmarkColor: kBrand,
      side: const BorderSide(color: kLine),
      labelStyle: const TextStyle(color: kInk, fontSize: 13),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: kInk,
      contentTextStyle: const TextStyle(color: kSurface),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: kSurface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius)),
      titleTextStyle: serif(21, weight: 500),
    ),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: kSurface, surfaceTintColor: Colors.transparent),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: kAccent),
    // Calm page changes: a soft fade-and-rise instead of the stock slide.
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    }),
  );
}
