import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../api/api_client.dart';

/// Third-party (Google AdMob) ad config, fetched from the server so ad units can be set or switched off
/// without shipping a new APK. Until the server says `enabled`, the ads SDK is never even started
/// and no ad widget takes any space.
class AdsController extends ChangeNotifier {
  AdsController(this._api, {Future<void> Function()? initSdk, bool? androidOnly})
      : _initSdk = initSdk ?? _defaultInit,
        _supported = androidOnly ?? (!kIsWeb && defaultTargetPlatform == TargetPlatform.android);

  final ApiClient _api;
  final Future<void> Function() _initSdk;
  final bool _supported;
  Map<String, String> _units = const {};
  bool _enabled = false;
  bool _loaded = false;

  static Future<void> _defaultInit() async {
    await MobileAds.instance.initialize();
  }

  bool get enabled => _enabled;

  /// The banner unit for a placement ('home' | 'browse' | 'product'), or null when it should stay empty.
  String? unit(String placement) => _enabled ? _units[placement] : null;

  /// Parses the server's `GET /ads/config` answer. Anything unexpected means "no ads".
  static Map<String, String> parseUnits(dynamic json) {
    final admob = (json is Map ? json['admob'] : null);
    if (admob is! Map || admob['enabled'] != true) return const {};
    final banners = admob['banners'];
    if (banners is! Map) return const {};
    final out = <String, String>{};
    banners.forEach((k, v) {
      if (k is String && v is String && RegExp(r'^ca-app-pub-\d{16}/\d{10}$').hasMatch(v)) out[k] = v;
    });
    return out;
  }

  /// Best effort and silent: an ad problem must never affect shopping.
  Future<void> load() async {
    if (_loaded || !_supported) return;
    _loaded = true;
    try {
      final units = parseUnits(await _api.get('/ads/config'));
      if (units.isEmpty) return;
      await _initSdk();
      _units = units;
      _enabled = true;
      notifyListeners();
    } catch (_) {
      // offline, old server without /ads/config, or SDK failure: stay ad-free
    }
  }
}
