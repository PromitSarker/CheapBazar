// Contract check against a REAL server (read-only except sign-up/login of a throwaway buyer).
//   dart run tool/live_check.dart http://103.228.38.69:3000
import 'dart:convert';
import 'dart:io';
import 'dart:math';

Future<void> main(List<String> args) async {
  final base = (args.isNotEmpty ? args.first : 'http://103.228.38.69:3000').replaceAll(RegExp(r'/+$'), '');
  final http = HttpClient();
  var failures = 0;
  void check(bool ok, String what) {
    stdout.writeln('${ok ? 'PASS' : 'FAIL'}  $what');
    if (!ok) failures++;
  }

  Future<(int, dynamic)> call(String method, String path, {Object? body, String? token, Map<String, String>? headers}) async {
    final req = await http.openUrl(method, Uri.parse('$base/api/m/v1$path'));
    req.headers.contentType = ContentType.json;
    if (token != null) req.headers.set('authorization', 'Bearer $token');
    headers?.forEach(req.headers.set);
    if (body != null) req.write(jsonEncode(body));
    final res = await req.close();
    final text = await res.transform(utf8.decoder).join();
    dynamic data;
    try { data = jsonDecode(text); } catch (_) {}
    return (res.statusCode, data);
  }

  var (s, d) = await call('GET', '/config');
  check(s == 200 && d['currency'] == 'BDT', 'config');
  (s, d) = await call('GET', '/home');
  check(s == 200 && d['items'] is List && d['stores'] is List, 'home (${(d['items'] as List).length} items, ${(d['stores'] as List).length} stores)');
  final items = (d['items'] as List);
  (s, d) = await call('GET', '/browse?tab=retail&limit=5');
  check(s == 200 && d['items'] is List, 'browse retail');
  (s, d) = await call('GET', '/browse?tab=wholesale&limit=5');
  check(s == 200 && d['paywall'] != null, 'browse wholesale is paywalled for guests (${d['paywall']})');
  if (items.isNotEmpty) {
    final slug = (items.first['store'] as Map)['slug'];
    (s, d) = await call('GET', '/stores/$slug');
    check(s == 200 && d['products'] is List, 'store page /$slug');
  }
  (s, d) = await call('GET', '/stores/does-not-exist-xyz');
  check(s == 404, 'unknown store is 404');
  (s, d) = await call('GET', '/my/orders');
  check(s == 401, 'my orders needs login (401)');
  (s, d) = await call('POST', '/auth/login', body: {'email': 'nobody@example.com', 'password': 'wrong-password'});
  check(s == 401, 'bad login is 401');
  (s, d) = await call('GET', '/orders/lookup?orderNumber=ORD-NOPE0000&phone=01700000000');
  check(s == 404, 'unknown order lookup is 404');

  final stamp = Random().nextInt(1 << 30).toRadixString(36);
  final email = 'livecheck-$stamp@example.com';
  (s, d) = await call('POST', '/auth/register', body: {'name': 'Live Check', 'email': email, 'password': 'livecheck-pass-1'});
  check(s == 200 && d['token'] is String && d['user']['role'] == 'BUYER', 'register a throwaway buyer');
  final token = d['token'] as String;
  (s, d) = await call('GET', '/me', token: token);
  check(s == 200 && d['user']['email'] == email, 'me');
  (s, d) = await call('GET', '/notifications', token: token);
  check(s == 200 && d['items'] is List, 'notifications');
  (s, d) = await call('GET', '/pro', token: token);
  check(s == 200 && d['status'] != null, 'buyer pro');
  (s, d) = await call('GET', '/my/orders', token: token);
  check(s == 200 && (d['orders'] as List).isEmpty, 'no orders yet');
  (s, d) = await call('POST', '/me/delete', token: token, body: {'password': 'wrong'});
  check(s == 401, 'delete needs the right password');
  (s, d) = await call('POST', '/me/delete', token: token, body: {'password': 'livecheck-pass-1'});
  check(s == 200, 'delete the throwaway account');
  (s, d) = await call('GET', '/me', token: token);
  check(s == 401, 'token is dead after deletion');

  http.close();
  stdout.writeln(failures == 0 ? '\nALL LIVE CHECKS PASSED' : '\n$failures LIVE CHECK(S) FAILED');
  exit(failures == 0 ? 0 : 1);
}
