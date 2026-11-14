import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import '../widgets/product_card.dart';
import 'auth_screen.dart';
import 'pro_screen.dart';
import 'product_page.dart';

class BrowseScreen extends StatefulWidget {
  const BrowseScreen({super.key, this.initialQuery});
  final String? initialQuery;

  @override
  State<BrowseScreen> createState() => BrowseScreenState();
}

class BrowseScreenState extends State<BrowseScreen> {
  final _search = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;

  String _tab = 'retail';
  String _sort = 'relevance';
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
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400 && !_loading && _page < _pages) _fetch(page: _page + 1);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _fetch());
  }

  /// Called by the shell when the Home search box is tapped.
  void focusSearch(String? query) {
    if (query != null) _search.text = query;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
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

  void _onQueryChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), () => _fetch());
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    context.watch<SessionController>();
    return Scaffold(
      appBar: AppBar(title: Text(t.t('browse'))),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
          child: TextField(
            controller: _search,
            onChanged: _onQueryChanged,
            onSubmitted: (_) => _fetch(),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: t.t('search_hint'),
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close),
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
                    if (_tab == 'wholesale' && (_sort == 'price_asc' || _sort == 'price_desc')) _sort = 'relevance';
                  });
                  _fetch();
                },
              ),
            ),
            const SizedBox(width: 8),
            PopupMenuButton<String>(
              tooltip: t.t('sort'),
              icon: const Icon(Icons.sort),
              onSelected: (v) {
                setState(() => _sort = v);
                _fetch();
              },
              itemBuilder: (_) => [
                PopupMenuItem(value: 'relevance', child: Text(t.t('sort_relevance'))),
                PopupMenuItem(value: 'price_asc', child: Text(t.t('sort_price_asc'))),
                PopupMenuItem(value: 'price_desc', child: Text(t.t('sort_price_desc'))),
                PopupMenuItem(value: 'name', child: Text(t.t('sort_name'))),
              ],
            ),
          ]),
        ),
        Expanded(child: _body(t)),
      ]),
    );
  }

  Widget _body(LocaleController t) {
    if (_error != null && _items.isEmpty) return ErrorRetry(message: _error!, onRetry: _fetch);
    if (_loading && _items.isEmpty) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: () => _fetch(),
      child: CustomScrollView(controller: _scroll, physics: const AlwaysScrollableScrollPhysics(), slivers: [
        if (_paywall != null)
          SliverToBoxAdapter(child: _paywallCard(t)),
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
          SliverFillRemaining(hasScrollBody: false, child: EmptyState(icon: Icons.search_off, title: t.t('no_orders')))
        else ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            sliver: SliverToBoxAdapter(child: Text('$_total', style: const TextStyle(color: Color(0xFF71717A)))),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            sliver: SliverGrid.builder(
              itemCount: _items.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.72),
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
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE4E4E7))),
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
