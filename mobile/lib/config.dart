/// Build-time configuration. Override with:
///   flutter build apk --dart-define=API_BASE_URL=https://shop.example.com
class AppConfig {
  static const String baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://cheapbazar.org');
  static const String apiPrefix = '/api/m/v1';
  // Keep both in sync with `version:` in pubspec.yaml (test/app_update_test.dart fails if they drift).
  static const String version = '1.1.0';
  static const int build = 2;
  static const String sellerSiteHint = 'the Cheap-Bazar website';
}
