import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';
import '../models/models.dart';

/// Login state. The session token lives in the platform keystore (Keychain / Keystore).
class SessionController extends ChangeNotifier {
  SessionController(this.api, {FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage() {
    api.onUnauthorized = _expired;
  }

  final ApiClient api;
  final FlutterSecureStorage _storage;

  AppUser? user;
  ProStatus? pro;
  int unread = 0;
  bool ready = false;
  bool sessionExpired = false;
  String? updateRequiredMessage;

  bool get loggedIn => user != null;

  Future<void> bootstrap() async {
    try {
      final cfg = await api.get('/config');
      final min = '${(cfg as Map)['minAppVersion'] ?? ''}';
      if (min.isNotEmpty && _versionLess(_appVersion, min)) updateRequiredMessage = min;
    } catch (_) {/* offline: the screens show their own retry */}
    try {
      final t = await _storage.read(key: 'session_token');
      if (t != null && t.isNotEmpty) {
        api.token = t;
        await refresh();
      }
    } catch (_) {
      api.token = null;
    }
    ready = true;
    notifyListeners();
  }

  static const _appVersion = '1.0.0';
  static bool _versionLess(String a, String b) {
    List<int> p(String v) => v.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    final x = p(a), y = p(b);
    for (var i = 0; i < 3; i++) {
      final xi = i < x.length ? x[i] : 0, yi = i < y.length ? y[i] : 0;
      if (xi != yi) return xi < yi;
    }
    return false;
  }

  /// Re-reads the profile, Buyer Pro status and unread count. Quietly drops a dead session.
  Future<void> refresh() async {
    if (api.token == null) return;
    try {
      final r = (await api.get('/me')) as Map<String, dynamic>;
      user = AppUser.fromJson((r['user'] as Map).cast<String, dynamic>());
      pro = ProStatus.fromJson((r['pro'] as Map).cast<String, dynamic>());
      unread = (r['unread'] as num?)?.toInt() ?? 0;
      notifyListeners();
    } on ApiException catch (e) {
      if (e.isUnauthorized) await _clear();
    }
  }

  Future<void> refreshUnread() async {
    if (!loggedIn) return;
    try {
      final r = (await api.get('/notifications/unread')) as Map;
      unread = (r['unread'] as num?)?.toInt() ?? 0;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> _auth(String path, Map<String, dynamic> body) async {
    final r = (await api.post(path, body)) as Map<String, dynamic>;
    final token = r['token'] as String;
    api.token = token;
    await _storage.write(key: 'session_token', value: token);
    sessionExpired = false;
    await refresh();
  }

  Future<void> login(String email, String password) => _auth('/auth/login', {'email': email, 'password': password});

  Future<void> register(String name, String email, String password) =>
      _auth('/auth/register', {'name': name, 'email': email, 'password': password});

  Future<void> logout() async {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    await _clear();
  }

  Future<void> deleteAccount(String password) async {
    await api.post('/me/delete', {'password': password});
    await _clear();
  }

  void _expired() {
    sessionExpired = true;
    _clear();
  }

  Future<void> _clear() async {
    api.token = null;
    user = null;
    pro = null;
    unread = 0;
    try {
      await _storage.delete(key: 'session_token');
    } catch (_) {}
    notifyListeners();
  }
}
