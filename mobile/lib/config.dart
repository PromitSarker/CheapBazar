/// Build-time configuration. Override with:
///   flutter build apk --dart-define=API_BASE_URL=https://shop.example.com
class AppConfig {
  static const String baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://103.228.38.69:3000');
  static const String apiPrefix = '/api/m/v1';
  static const String version = '1.0.0';
  static const String sellerSiteHint = 'the Cheap-Bazar website';
}
