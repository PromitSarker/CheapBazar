import 'package:shared_preferences/shared_preferences.dart';

/// The last few searches, kept on the device only (never sent anywhere).
class RecentSearches {
  static const _key = 'recent_searches_v1';
  static const max = 8;

  /// Pure list logic: newest first, case-insensitive de-duplication, capped.
  static List<String> pushed(List<String> current, String term) {
    final t = term.trim();
    if (t.length < 2) return current;
    final out = <String>[t, ...current.where((e) => e.toLowerCase() != t.toLowerCase())];
    return out.take(max).toList();
  }

  static Future<List<String>> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      return p.getStringList(_key) ?? const [];
    } catch (_) {
      return const [];
    }
  }

  static Future<List<String>> add(String term) async {
    final next = pushed(await load(), term);
    try {
      final p = await SharedPreferences.getInstance();
      await p.setStringList(_key, next);
    } catch (_) {}
    return next;
  }

  static Future<void> clear() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.remove(_key);
    } catch (_) {}
  }
}
