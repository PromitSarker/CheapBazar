import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';

/// A district the buyer can pick when GPS is off or refused (the list comes from the server, so it never drifts from the website).
class District {
  const District({required this.id, required this.nameEn, required this.nameBn, required this.lat, required this.lng});
  final String id;
  final String nameEn;
  final String nameBn;
  final double lat;
  final double lng;

  String name(bool bn) => bn && nameBn.isNotEmpty ? nameBn : nameEn;

  factory District.fromJson(Map<String, dynamic> j) => District(
        id: '${j['id']}',
        nameEn: '${j['nameEn']}',
        nameBn: '${j['nameBn'] ?? ''}',
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
      );
}

/// Why asking the phone for its position failed. `code` is one of: disabled, denied, denied_forever, failed.
class LocationException implements Exception {
  LocationException(this.code);
  final String code;
  @override
  String toString() => 'LocationException($code)';
}

typedef PositionFetcher = Future<({double lat, double lng})> Function();

/// Asks the phone for a rough position. Only coarse accuracy is needed (shops are matched by kilometres), which also
/// means the app only ever asks for the "approximate location" permission.
Future<({double lat, double lng})> gpsPosition() async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) throw LocationException('disabled');
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied) throw LocationException('denied');
    if (perm == LocationPermission.deniedForever) throw LocationException('denied_forever');
    final p = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.low, timeLimit: Duration(seconds: 15)),
    );
    return (lat: p.latitude, lng: p.longitude);
  } on LocationException {
    rethrow;
  } catch (_) {
    throw LocationException('failed');
  }
}

/// Where the buyer is, and the admin's range rule. The position lives only on the phone (rounded to ~110 m) and is attached to
/// the requests that browse shops; it is never stored on the server.
class LocationController extends ChangeNotifier {
  LocationController(this._api, {PositionFetcher? fetcher}) : _fetch = fetcher ?? gpsPosition;

  final ApiClient _api;
  final PositionFetcher _fetch;

  double? lat;
  double? lng;

  /// A district id, or `gps`.
  String? label;

  /// The admin's range limit is on (so the app must know where the buyer is).
  bool enabled = false;
  double? radiusKm;
  List<District> districts = const [];

  /// Bumped whenever the position or the rule changes, so screens know to reload.
  int version = 0;

  bool get hasLocation => lat != null && lng != null;

  District? get district {
    for (final d in districts) {
      if (d.id == label) return d;
    }
    return null;
  }

  /// "Near me" for GPS, otherwise the district's name.
  String shortLabel(bool bn, {required String nearMe, required String notSet}) {
    if (!hasLocation) return notSet;
    if (label == 'gps') return nearMe;
    return district?.name(bn) ?? nearMe;
  }

  static double _round(double v) => (v * 1000).round() / 1000;

  Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final a = p.getDouble('loc_lat'), b = p.getDouble('loc_lng');
      if (a != null && b != null) {
        lat = a;
        lng = b;
        label = p.getString('loc_label') ?? 'gps';
        _api.location = (lat: a, lng: b);
      }
    } catch (_) {}
    notifyListeners();
    unawaited(refreshConfig()); // never hold the app's start-up for this
  }

  /// Reads the range rule and district list. Quietly keeps the last known rule when offline.
  Future<void> refreshConfig() async {
    try {
      final r = (await _api.get('/location/config')) as Map;
      final nowEnabled = r['enabled'] == true;
      final nowRadius = (r['radiusKm'] as num?)?.toDouble();
      final list = ((r['districts'] as List?) ?? const []).map((e) => District.fromJson((e as Map).cast<String, dynamic>())).toList();
      final changed = nowEnabled != enabled || nowRadius != radiusKm;
      enabled = nowEnabled;
      radiusKm = nowRadius;
      if (list.isNotEmpty) districts = list;
      if (changed) version++;
      notifyListeners();
    } catch (_) {/* older server without the range feature, or offline: nothing is limited */}
  }

  Future<void> useGps() async {
    final p = await _fetch();
    await _set(p.lat, p.lng, 'gps');
  }

  Future<void> chooseDistrict(District d) => _set(d.lat, d.lng, d.id);

  Future<void> clear() async {
    lat = lng = null;
    label = null;
    _api.location = null;
    version++;
    notifyListeners();
    try {
      final p = await SharedPreferences.getInstance();
      await p.remove('loc_lat');
      await p.remove('loc_lng');
      await p.remove('loc_label');
    } catch (_) {}
  }

  Future<void> _set(double a, double b, String how) async {
    lat = _round(a);
    lng = _round(b);
    label = how;
    _api.location = (lat: lat!, lng: lng!);
    version++;
    notifyListeners();
    try {
      final p = await SharedPreferences.getInstance();
      await p.setDouble('loc_lat', lat!);
      await p.setDouble('loc_lng', lng!);
      await p.setString('loc_label', how);
    } catch (_) {}
  }
}
