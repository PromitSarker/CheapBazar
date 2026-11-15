import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/catalog.dart';
import '../../state/l10n.dart';
import '../../state/recent_searches.dart';
import '../../state/session.dart';
import '../theme.dart';
import '../widgets/cart_bar.dart';
import '../widgets/common.dart';
import '../widgets/filter_sheet.dart';
import '../widgets/product_card.dart';
import '../widgets/skeleton.dart';
import 'auth_screen.dart';
import 'cart_screen.dart';
import 'pro_screen.dart';
import 'product_page.dart';

/// Product listing: search results, a category / sub-category, deals, or the wholesale tab.
/// Opened from Home (search box, tiles, shelves) and from the Categories tab.
class BrowseScreen extends StatefulWidget {
  const BrowseScreen({super.key, this.initialQuery, this.categoryId, this.title, this.onSale = false, this.autofocus = false, this.initialTab = 'retail'});
  final String? initialQuery;
  final String? categoryId;
  final String? title;
  final bool onSale;
  final bool autofocus;
  final String initialTab; // retail | wholesale

  @override
  State<BrowseScreen> createState() => BrowseScreenState();
}

class BrowseScreenState extends State<BrowseScreen> {
  final _search = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  Timer? _debounce;

  late String _tab = widget.initialTab;
  String _sort = 'relevance';
  late String? _categoryId = widget.categoryId;
  late ProductFilters _filters = ProductFilters(onSale: widget.onSale);
  List<({String brand, int count})> _brands = const [];
  List<String> _recents = const [];
  List<String> _suggestions = const [];
  List<({String id, String nameEn, String nameBn})> _suggestCats = const [];
  Timer? _suggestDebounce;
  int _suggestSeq = 0;
  final List<Product> _items = [];
  List<AdBanner> _ads = [];
  int _page = 1;
  int _pages = 1;
  int _total = 0;
  bool _loading = false;
  String? _error;
  String? _paywall; // LOGIN_REQUIRED | BUYER_PRO_REQUIRED

  @override
  void initState() {
    super.initState();
    _search.text = widget.initialQuery ?? '';
    _focus.addListener(() {
      if (mounted) setState(() {});
    });
    RecentSearches.load().then((r) {
      if (mounted) setState(() => _recents = r);
    });
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400 && !_loading && _page < _pages) _fetch(page: _page + 1);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<CatalogController>().load();
      _fetch();
      if (widget.autofocus) _focus.requestFocus();
    });
  }

  /// Kept for callers that set the query from outside.
  void focusSearch(String? query) {
    if (query != null) _search.text = query;
    _focus.requestFocus();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _suggestDebounce?.cancel();
    _search.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _fetch({int page = 1}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = (await context.read<ApiClient>().get('/browse', query: {
        'tab': _tab,
        'q': _search.text.trim(),
        'category': _categoryId,
        'sale': _filters.onSale && _tab == 'retail' ? '1' : null,
        'brand': _filters.brand,
        'min': _filters.min == null ? null : '${_filters.min}',
        'max': _filters.max == null ? null : '${_filters.max}',
        'stock': _filters.inStock ? 'true' : null,
        'sort': _sort == 'relevance' ? null : _sort,
        'page': '$page',
        'limit': '20',
      })) as Map<String, dynamic>;
      if (!mounted) return;
      final wholesale = _tab == 'wholesale';
      final list = ((r['items'] as List?) ?? const []).map((e) => Product.fromBrowse((e as Map).cast<String, dynamic>(), wholesale: wholesale)).toList();
      final pw = r['paywall'] as Map?;
      setState(() {
        if (page == 1) _items.clear();
        _items.addAll(list);
        _page = (r['page'] as num?)?.toInt() ?? page;
        _pages = (r['pages'] as num?)?.toInt() ?? 1;
        _total = (r['total'] as num?)?.toInt() ?? _items.length;
        _paywall = (pw != null && pw['locked'] == true) ? '${pw['reason']}' : null;
        _brands = (((r['facets'] as Map?)?['brands'] as List?) ?? const [])
            .map((e) => (brand: '${(e as Map)['brand']}', count: (e['count'] as num?)?.toInt() ?? 0))
            .toList();
        _ads = ((r['ads'] as List?) ?? const []).map((e) => AdBanner.fromJson((e as Map).cast<String, dynamic>())).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _loading = false;
      });
    }
  }

  void _onQueryChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () => _fetch());
    _suggestDebounce?.cancel();
    final term = v.trim();
    if (term.length < 2) {
      setState(() {
        _suggestions = const [];
        _suggestCats = const [];
      });
      return;
    }
    _suggestDebounce = Timer(const Duration(milliseconds: 250), () => _loadSuggestions(term));
  }

  Future<void> _loadSuggestions(String term) async {
    final seq = ++_suggestSeq;
    try {
      final r = (await context.read<ApiClient>().get('/search/suggest', query: {'q': term})) as Map<String, dynamic>;
      if (!mounted || seq != _suggestSeq) return; // a newer keystroke already replaced this request
      setState(() {
        _suggestions = ((r['suggestions'] as List?) ?? const []).map((e) => '$e').toList();
        _suggestCats = ((r['categories'] as List?) ?? const [])
            .map((e) => (id: '${(e as Map)['id']}', nameEn: '${e['nameEn']}', nameBn: '${e['nameBn']}'))
            .toList();
      });
    } catch (_) {
      // suggestions are a nicety; typing and searching still work
    }
  }

  /// Run a search for [term] now: remembers it, closes the keyboard and the suggestion panel.
  Future<void> _submit(String term) async {
    _search.text = term;
    _search.selection = TextSelection.collapsed(offset: term.length);
    _focus.unfocus();
    _suggestSeq++;
    final next = await RecentSearches.add(term);
    if (mounted) setState(() => _recents = next);
    _fetch();
  }

  Future<void> _openFilters() async {
    final r = await showFilterSheet(
      context,
      current: _filters,
      brands: _brands,
      allowPrice: _tab == 'retail' || _paywall == null,
      allowSale: _tab == 'retail',
    );
    if (r == null || r == _filters) return;
    setState(() => _filters = r);
    _fetch();
  }

  void _openCart() => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(goToShop: () => Navigator.of(context).pop())));

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final catalog = context.watch<CatalogController>();
    context.watch<SessionController>();
    final cur = catalog.byId(_categoryId);
    final top = cur == null ? null : (cur.parentId == null ? cur : catalog.byId(cur.parentId));
    final bn = t.isBn;
    final title = widget.title ?? (cur?.name(bn)) ?? t.t('browse');

    return Scaffold(
      appBar: AppBar(title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis)),
      bottomNavigationBar: SafeArea(child: CartBar(onTap: _openCart)),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
          child: TextField(
            controller: _search,
            focusNode: _focus,
            onChanged: _onQueryChanged,
            onSubmitted: (v) => v.trim().isEmpty ? _fetch() : _submit(v.trim()),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: cur != null ? t.t('search_in', {'name': cur.name(bn)}) : t.t('search_hint'),
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close),
                      tooltip: t.t('clear'),
                      onPressed: () {
                        _search.clear();
                        _fetch();
                      },
                    ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(children: [
            Expanded(
              child: SegmentedButton<String>(
                segments: [
                  ButtonSegment(value: 'retail', label: Text(t.t('retail'))),
                  ButtonSegment(value: 'wholesale', label: Text(t.t('wholesale')), icon: const Icon(Icons.inventory_2_outlined, size: 16)),
                ],
                selected: {_tab},
                showSelectedIcon: false,
                onSelectionChanged: (s) {
                  setState(() {
                    _tab = s.first;
                    if (_tab == 'wholesale' && (_sort == 'price_asc' || _sort == 'price_desc' || _sort == 'discount')) _sort = 'relevance';
                  });
                  _fetch();
                },
              ),
            ),
            const SizedBox(width: 4),
            Badge(
              isLabelVisible: _filters.activeCount > 0,
              label: Text('${_filters.activeCount}'),
              child: IconButton(tooltip: t.t('filters'), icon: const Icon(Icons.tune), onPressed: _openFilters),
            ),
            PopupMenuButton<String>(
              tooltip: t.t('sort'),
              icon: const Icon(Icons.sort),
              onSelected: (v) {
                setState(() => _sort = v);
                _fetch();
              },
              itemBuilder: (_) => [
                PopupMenuItem(value: 'relevance', child: Text(t.t('sort_relevance'))),
                if (_tab == 'retail') PopupMenuItem(value: 'discount', child: Text(t.t('sort_discount'))),
                PopupMenuItem(value: 'price_asc', child: Text(t.t('sort_price_asc'))),
                PopupMenuItem(value: 'price_desc', child: Text(t.t('sort_price_desc'))),
                PopupMenuItem(value: 'name', child: Text(t.t('sort_name'))),
              ],
            ),
          ]),
        ),
        _chipsRow(t, top, bn),
        Expanded(child: _showPanel ? _suggestionPanel(t, bn) : _body(t)),
      ]),
    );
  }

  bool get _showPanel {
    if (!_focus.hasFocus) return false;
    final typed = _search.text.trim().length >= 2;
    return typed ? (_suggestions.isNotEmpty || _suggestCats.isNotEmpty) : _recents.isNotEmpty;
  }

  Widget _suggestionPanel(LocaleController t, bool bn) {
    final typed = _search.text.trim().length >= 2;
    return ListView(keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag, children: [
      if (!typed) ...[
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
          child: Row(children: [
            Expanded(child: Text(t.t('recent_searches'), style: const TextStyle(fontWeight: FontWeight.w700))),
            TextButton(
              onPressed: () async {
                await RecentSearches.clear();
                if (mounted) setState(() => _recents = const []);
              },
              child: Text(t.t('clear_all')),
            ),
          ]),
        ),
        for (final r in _recents)
          ListTile(leading: const Icon(Icons.history, color: kMuted), title: Text(r), dense: true, onTap: () => _submit(r)),
      ] else ...[
        for (final c in _suggestCats)
          ListTile(
            leading: const Icon(Icons.category_outlined, color: kAction),
            title: Text(_search.text.trim()),
            subtitle: Text(t.t('in_category', {'name': bn && c.nameBn.isNotEmpty ? c.nameBn : c.nameEn})),
            dense: true,
            onTap: () {
              _search.clear();
              _focus.unfocus();
              setState(() => _categoryId = c.id);
              _fetch();
            },
          ),
        for (final s in _suggestions)
          ListTile(leading: const Icon(Icons.search, color: kMuted), title: Text(s), dense: true, onTap: () => _submit(s)),
      ],
    ]);
  }

  /// "On sale" + the department's sub-categories, in one scrolling row.
  Widget _chipsRow(LocaleController t, ShopCategory? top, bool bn) {
    final kids = top?.children ?? const <ShopCategory>[];
    if (_tab != 'retail' && kids.isEmpty && _filters.activeCount == 0) return const SizedBox(height: 4);
    return SizedBox(
      height: 52,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        children: [
          if (_filters.brand != null) _removable(_filters.brand!, () => _filters = _filters.copyWith(brand: null)),
          if (_filters.min != null || _filters.max != null)
            _removable(
              '৳${_filters.min?.round() ?? 0} – ${_filters.max == null ? '∞' : '৳${_filters.max!.round()}'}',
              () => _filters = _filters.copyWith(min: null, max: null),
            ),
          if (_filters.inStock) _removable(t.t('in_stock_only'), () => _filters = _filters.copyWith(inStock: false)),
          if (_tab == 'retail')
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(t.t('on_sale')),
                avatar: const Icon(Icons.local_offer_outlined, size: 16),
                selected: _filters.onSale,
                showCheckmark: false,
                selectedColor: kActionSoft,
                onSelected: (v) {
                  setState(() => _filters = _filters.copyWith(onSale: v));
                  _fetch();
                },
              ),
            ),
          if (top != null && kids.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(t.t('all')),
                selected: _categoryId == top.id,
                selectedColor: kActionSoft,
                onSelected: (_) {
                  setState(() => _categoryId = top.id);
                  _fetch();
                },
              ),
            ),
            for (final k in kids)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(k.count > 0 ? '${k.name(bn)} (${toBnIf(bn, '${k.count}')})' : k.name(bn)),
                  selected: _categoryId == k.id,
                  selectedColor: kActionSoft,
                  onSelected: (_) {
                    setState(() => _categoryId = k.id);
                    _fetch();
                  },
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _removable(String label, VoidCallback clear) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: InputChip(
          label: Text(label),
          backgroundColor: kActionSoft,
          onDeleted: () {
            setState(clear);
            _fetch();
          },
        ),
      );

  Widget _body(LocaleController t) {
    if (_error != null && _items.isEmpty) return ErrorRetry(message: _error!, onRetry: _fetch);
    if (_loading && _items.isEmpty) return const _GridSkeleton();
    return RefreshIndicator(
      onRefresh: () => _fetch(),
      child: CustomScrollView(controller: _scroll, physics: const AlwaysScrollableScrollPhysics(), slivers: [
        if (_paywall != null) SliverToBoxAdapter(child: _paywallCard(t)),
        if (_ads.isNotEmpty && _tab == 'retail')
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: SizedBox(
                height: 90,
                child: Card(
                  clipBehavior: Clip.antiAlias,
                  child: Stack(fit: StackFit.expand, children: [
                    NetImage(_ads.first.imageUrl),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: Container(
                        color: Colors.black54,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        child: Text('${t.t('sponsored')} · ${_ads.first.headline}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 12)),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        if (_items.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              icon: Icons.search_off,
              title: _categoryId != null || _filters.activeCount > 0 ? t.t('no_products_here') : t.t('no_results'),
              subtitle: _categoryId != null || _filters.activeCount > 0 ? t.t('no_products_here_hint') : null,
            ),
          )
        else ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            sliver: SliverToBoxAdapter(child: Text(t.t('products_count', {'n': toBnIf(t.isBn, '$_total')}), style: const TextStyle(color: kMuted))),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            sliver: SliverGrid.builder(
              itemCount: _items.length,
              gridDelegate: productGridDelegate(context),
              itemBuilder: (_, i) => ProductCard(
                product: _items[i],
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductPage(product: _items[i], paywallReason: _paywall))),
              ),
            ),
          ),
          if (_loading) const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))),
        ],
      ]),
    );
  }

  Widget _paywallCard(LocaleController t) {
    final needLogin = _paywall == 'LOGIN_REQUIRED';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: kLine)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.lock_outline),
            const SizedBox(width: 8),
            Expanded(child: Text(needLogin ? t.t('wholesale_locked_login') : t.t('wholesale_locked_pro'), style: const TextStyle(fontWeight: FontWeight.w600))),
          ]),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => needLogin ? const AuthScreen() : const ProScreen()));
              if (mounted) {
                await context.read<SessionController>().refresh();
                _fetch();
              }
            },
            child: Text(needLogin ? t.t('login') : t.t('get_buyer_pro')),
          ),
        ]),
      ),
    );
  }
}

class _GridSkeleton extends StatelessWidget {
  const _GridSkeleton();
  @override
  Widget build(BuildContext context) => GridView.builder(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        itemCount: 6,
        gridDelegate: productGridDelegate(context),
        itemBuilder: (_, _) => const ProductCardSkeleton(),
      );
}
