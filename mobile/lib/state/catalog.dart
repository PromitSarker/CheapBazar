import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../models/models.dart';

/// The admin-managed category tree. Loaded once (Home hands it over for free), refreshed on pull-to-refresh.
class CatalogController extends ChangeNotifier {
  CatalogController(this._api);
  final ApiClient _api;

  List<ShopCategory> categories = const [];
  bool loading = false;
  bool loaded = false;
  String? error;

  Future<void> load({bool force = false}) async {
    if ((loaded || loading) && !force) return;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final r = (await _api.get('/categories')) as Map<String, dynamic>;
      categories = ((r['categories'] as List?) ?? const []).map((e) => ShopCategory.fromJson((e as Map).cast<String, dynamic>())).toList();
      loaded = true;
    } catch (e) {
      error = e is ApiException ? e.message : 'Could not load categories.';
    }
    loading = false;
    notifyListeners();
  }

  /// Home already fetched the tree; reuse it instead of a second request.
  void setFromHome(List<ShopCategory> list) {
    if (list.isEmpty && loaded) return; // never replace a good tree with an outage's empty one
    categories = list;
    loaded = true;
    error = null;
    notifyListeners();
  }

  ShopCategory? byId(String? id) {
    if (id == null) return null;
    for (final c in categories) {
      if (c.id == id) return c;
      for (final s in c.children) {
        if (s.id == id) return s;
      }
    }
    return null;
  }

  /// "Grocery & Food › Fruits" for a product's category (null when unknown).
  List<ShopCategory> trail(String? id) {
    final c = byId(id);
    if (c == null) return const [];
    final parent = byId(c.parentId);
    return [?parent, c];
  }
}
