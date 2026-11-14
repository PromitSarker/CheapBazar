import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:cheapbazar/api/api_client.dart';

http.Response jsonRes(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  test('sends bearer token, app version and query; parses JSON', () async {
    late http.Request seen;
    final api = ApiClient(
      baseUrl: 'https://shop.test/',
      client: MockClient((req) async {
        seen = req;
        return jsonRes({'ok': true});
      }),
    )..token = 'tok_abcdefghijklmnop';
    final r = await api.get('/browse', query: {'q': 'রুটি', 'page': '2', 'sort': null});
    expect(r['ok'], true);
    expect(seen.url.toString(), startsWith('https://shop.test/api/m/v1/browse?'));
    expect(seen.url.queryParameters, {'q': 'রুটি', 'page': '2'});
    expect(seen.headers['authorization'], 'Bearer tok_abcdefghijklmnop');
    expect(seen.headers['x-app-version'], isNotEmpty);
  });

  test('POST sends JSON and extra headers (idempotency key)', () async {
    late http.Request seen;
    final api = ApiClient(baseUrl: 'https://shop.test', client: MockClient((req) async {
      seen = req;
      return jsonRes({'order': {}});
    }));
    await api.post('/orders', {'a': 1}, {'idempotency-key': 'k1'});
    expect(jsonDecode(seen.body), {'a': 1});
    expect(seen.headers['idempotency-key'], 'k1');
    expect(seen.method, 'POST');
  });

  test('server errors become ApiException with message and code', () async {
    final api = ApiClient(baseUrl: 'https://shop.test', client: MockClient((_) async => jsonRes({'error': 'Out of stock', 'code': 'OUT_OF_STOCK'}, 409)));
    await expectLater(
      api.post('/orders', {}),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Out of stock').having((e) => e.code, 'code', 'OUT_OF_STOCK').having((e) => e.status, 'status', 409)),
    );
  });

  test('401 with a token triggers onUnauthorized; without a token it does not', () async {
    var called = 0;
    final api = ApiClient(baseUrl: 'https://shop.test', client: MockClient((_) async => jsonRes({'error': 'Please log in again.', 'code': 'UNAUTHORIZED'}, 401)))
      ..onUnauthorized = () => called++;
    await expectLater(api.get('/me'), throwsA(isA<ApiException>()));
    expect(called, 0);
    api.token = 'tok_abcdefghijklmnop';
    await expectLater(api.get('/me'), throwsA(isA<ApiException>().having((e) => e.isUnauthorized, 'isUnauthorized', true)));
    expect(called, 1);
  });

  test('network failures are friendly and flagged', () async {
    final api = ApiClient(baseUrl: 'https://shop.test', client: MockClient((_) async => throw http.ClientException('boom')));
    await expectLater(api.get('/home'), throwsA(isA<ApiException>().having((e) => e.isNetwork, 'isNetwork', true)));
  });

  test('absoluteUrl resolves uploads against the server', () {
    final api = ApiClient(baseUrl: 'http://1.2.3.4:3000/');
    expect(api.absoluteUrl('/uploads/a.png'), 'http://1.2.3.4:3000/uploads/a.png');
    expect(api.absoluteUrl('https://cdn.x/y.png'), 'https://cdn.x/y.png');
    expect(api.absoluteUrl(null), '');
  });
}
