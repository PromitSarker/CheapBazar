import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message, [this.code]);
  final int status;
  final String message;
  final String? code;

  bool get isUnauthorized => status == 401;
  bool get isNetwork => status == 0;

  @override
  String toString() => message;
}

/// Thin JSON client for the Cheap-Bazar mobile API (`/api/m/v1`).
/// The app never talks to the internal services; it only holds its own session token.
class ApiClient {
  ApiClient({http.Client? client, String? baseUrl})
      : _http = client ?? http.Client(),
        baseUrl = (baseUrl ?? AppConfig.baseUrl).replaceAll(RegExp(r'/+$'), '');

  final http.Client _http;
  final String baseUrl;
  String? token;

  /// The buyer's position (rounded). Sent with every request that browses shops, so the admin's range limit can be applied.
  ({double lat, double lng})? location;

  static const _locationPaths = ['/home', '/browse', '/search/suggest', '/products', '/stores', '/categories'];

  /// Called when the server says the session is no longer valid.
  void Function()? onUnauthorized;

  /// Turns a path such as `/uploads/x.png` into an absolute URL; absolute URLs pass through.
  String absoluteUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '$baseUrl${path.startsWith('/') ? '' : '/'}$path';
  }

  Uri _uri(String path, Map<String, String?>? query) {
    final q = <String, String>{};
    query?.forEach((k, v) {
      if (v != null && v.isNotEmpty) q[k] = v;
    });
    final base = Uri.parse('$baseUrl${AppConfig.apiPrefix}$path');
    return q.isEmpty ? base : base.replace(queryParameters: q);
  }

  Map<String, String> _headers([Map<String, String>? extra]) => {
        'accept': 'application/json',
        'content-type': 'application/json; charset=utf-8',
        'x-app-version': AppConfig.version,
        if (token != null) 'authorization': 'Bearer $token',
        ...?extra,
      };

  Future<dynamic> get(String path, {Map<String, String?>? query}) {
    final loc = location;
    if (loc != null && _locationPaths.any(path.startsWith)) {
      query = {...?query, 'lat': '${loc.lat}', 'lng': '${loc.lng}'};
    }
    return _send('GET', path, query: query);
  }

  Future<dynamic> post(String path, [Object? body, Map<String, String>? headers]) {
    final loc = location;
    // an order carries the buyer's position so the server can re-check the shop is in range
    if (loc != null && path == '/orders' && body is Map<String, dynamic> && !body.containsKey('location')) {
      body = {...body, 'location': {'lat': loc.lat, 'lng': loc.lng}};
    }
    return _send('POST', path, body: body ?? const <String, dynamic>{}, headers: headers);
  }

  Future<dynamic> _send(String method, String path,
      {Map<String, String?>? query, Object? body, Map<String, String>? headers}) async {
    final uri = _uri(path, query);
    try {
      final http.Response res;
      final h = _headers(headers);
      if (method == 'GET') {
        res = await _http.get(uri, headers: h).timeout(const Duration(seconds: 25));
      } else {
        res = await _http.post(uri, headers: h, body: jsonEncode(body)).timeout(const Duration(seconds: 30));
      }
      dynamic data;
      final text = utf8.decode(res.bodyBytes);
      if (text.isNotEmpty) {
        try {
          data = jsonDecode(text);
        } catch (_) {
          data = null;
        }
      }
      if (res.statusCode >= 200 && res.statusCode < 300) return data ?? <String, dynamic>{};
      final msg = (data is Map && data['error'] is String) ? data['error'] as String : 'Something went wrong (${res.statusCode}).';
      final code = (data is Map && data['code'] is String) ? data['code'] as String : null;
      if (res.statusCode == 401 && token != null) onUnauthorized?.call();
      throw ApiException(res.statusCode, msg, code);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw ApiException(0, 'The server took too long to answer. Check your connection and try again.', 'NETWORK');
    } on SocketException {
      throw ApiException(0, 'No internet connection. Check your network and try again.', 'NETWORK');
    } on http.ClientException {
      throw ApiException(0, 'No internet connection. Check your network and try again.', 'NETWORK');
    }
  }
}
