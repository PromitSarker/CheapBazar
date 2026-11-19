import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/catalog.dart';
import '../../state/l10n.dart';
import '../../state/location.dart';
import '../../state/session.dart';
import '../theme.dart';
import '../widgets/category_tile.dart';
import '../widgets/common.dart';
import '../widgets/location_ui.dart';
import '../widgets/network_ad.dart';
import '../widgets/product_card.dart';
import '../widgets/skeleton.dart';
import 'auth_screen.dart';
import 'browse_screen.dart';
import 'notifications_screen.dart';
import 'product_page.dart';
import 'store_page.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.goToCategories});

  /// Opens the Categories tab ("All" tile / "See all").
  final VoidCallback goToCategories;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeData {
  _HomeData(this.ads, this.stores, this.items, this.categories, this.shelves, {this.locationRequired = false, this.radiusKm});
  /// The admin limits shops by distance and the server does not know where this buyer is.
  final bool locationRequired;
  final double? radiusKm;
  final List<AdBanner> ads;
  final List<StoreCardData> stores;
  final List<Product> items; // flat list from servers that predate shelves
  final List<ShopCategory> categories;
  final List<Shelf> shelves;
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<_HomeData> _future = _load();
  final _page = PageController(viewportFraction: 0.92);
  int _adIndex = 0;
  int _locVersion = -1;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // the buyer moved or the admin changed the range: show what is now in reach
    final v = context.watch<LocationController>().version;
    if (_locVersion != -1 && v != _locVersion) _future = _load();
    _locVersion = v;
  }

  List<T> _list<T>(dynamic v, T Function(Map<String, dynamic>) f) =>
      ((v as List?) ?? const []).map((e) => f((e as Map).cast<String, dynamic>())).toList();

  Future<_HomeData> _load() async {
    final api = context.read<ApiClient>();
    final catalog = context.read<CatalogController>();
    final d = (await api.get('/home')) as Map<String, dynamic>;
    final data = _HomeData(
      _list(d['ads'], AdBanner.fromJson),
      _list(d['stores'], StoreCardData.fromJson),
      _list(d['items'], (m) => Product.fromBrowse(m)),
      _list(d['categories'], ShopCategory.fromJson),
      _list(d['shelves'], Shelf.fromJson),
      locationRequired: (d['location'] as Map?)?['required'] == true,
      radiusKm: ((d['location'] as Map?)?['radiusKm'] as num?)?.toDouble(),
    );
    catalog.setFromHome(data.categories);
    return data;
  }

  Future<void> _reload() async {
    setState(() => _future = _load());
    await _future.then((_) {}, onError: (_) {});
    if (mounted) context.read<SessionController>().refreshUnread();
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  void _openBrowse({String? categoryId, String? title, bool onSale = false, bool focusSearch = false}) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => BrowseScreen(categoryId: categoryId, title: title, onSale: onSale, autofocus: focusSearch)));
  }

  void _openProduct(Product p) => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductPage(product: p)));

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final session = context.watch<SessionController>();
    return Scaffold(
      appBar: AppBar(
        title: Text(t.t('app_name')),
        actions: [
          IconButton(
            tooltip: t.t('notifications'),
            onPressed: () async {
              if (!session.loggedIn) {
                await Navigator.push(context, MaterialPageRoute(builder: (_) => const AuthScreen()));
                if (!context.mounted || !context.read<SessionController>().loggedIn) return;
              }
              if (!context.mounted) return;
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen()));
              if (context.mounted) context.read<SessionController>().refreshUnread();
            },
            icon: Badge(
              isLabelVisible: session.unread > 0,
              label: Text('${session.unread > 99 ? '99+' : session.unread}'),
              child: const Icon(Icons.notifications_none_rounded),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: FutureBuilder<_HomeData>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const _HomeSkeleton();
            if (snap.hasError) {
              return ListView(children: [SizedBox(height: 420, child: ErrorRetry(message: errorText(snap.error!), onRetry: _reload))]);
            }
            return _content(context, snap.data!, t);
          },
        ),
      ),
    );
  }

  Widget _content(BuildContext context, _HomeData d, LocaleController t) {
    final bn = t.isBn;
    final hasShelves = d.shelves.isNotEmpty;
    if (d.locationRequired) {
      // keep it scrollable so pull-to-refresh still works
      return ListView(children: [SizedBox(height: 480, child: LocationPrompt(radiusKm: d.radiusKm))]);
    }
    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      const LocationBar(),
      _SearchBox(hint: t.t('search_hint'), onTap: () => _openBrowse(focusSearch: true)),
      if (d.ads.isNotEmpty) ...[
        SizedBox(
          height: 160,
          child: PageView.builder(
            controller: _page,
            itemCount: d.ads.length,
            onPageChanged: (i) => setState(() => _adIndex = i),
            itemBuilder: (_, i) => _AdTile(ad: d.ads[i]),
          ),
        ),
        if (d.ads.length > 1) _Dots(count: d.ads.length, index: _adIndex),
        const SizedBox(height: 4),
      ],
      if (d.categories.isNotEmpty) ..._categorySection(context, d.categories, t),
      for (var i = 0; i < d.shelves.length; i++) ...[
        ..._shelf(context, d.shelves[i], bn, t),
        // One Google ad, after the second shelf (or the last one if there are fewer). Seller banners stay at the top.
        if (i == (d.shelves.length < 2 ? d.shelves.length - 1 : 1)) const NetworkAd(placement: 'home'),
      ],
      if (d.stores.isNotEmpty) ...[
        _sectionTitle(t.t('stores')),
        SizedBox(
          height: 118,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: d.stores.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (_, i) => _StoreTile(store: d.stores[i]),
          ),
        ),
      ],
      // Older servers send no shelves: keep the plain grid so the app still shows products.
      if (!hasShelves && d.items.isNotEmpty) ...[
        _sectionTitle(t.t('fresh_picks'), action: TextButton(onPressed: () => _openBrowse(), child: Text(t.t('see_all')))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: d.items.length,
            gridDelegate: productGridDelegate(context),
            itemBuilder: (_, i) => ProductCard(product: d.items[i], onTap: () => _openProduct(d.items[i])),
          ),
        ),
      ],
      if (d.stores.isEmpty && d.items.isEmpty && !hasShelves) SizedBox(height: 320, child: EmptyState(icon: Icons.storefront_outlined, title: t.t('no_products_here'), subtitle: t.t('no_products_here_hint'))),
    ]);
  }

  /// Up to 7 departments + an "All" tile. Departments with products come first; while the catalogue is
  /// new and mostly empty we show them all rather than a nearly empty grid.
  List<Widget> _categorySection(BuildContext context, List<ShopCategory> cats, LocaleController t) {
    final withProducts = cats.where((c) => c.count > 0).toList();
    final shown = (withProducts.length >= 4 ? withProducts : cats).take(7).toList();
    return [
      _sectionTitle(t.t('categories')),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 0.82,
          children: [
            for (final c in shown)
              CategoryTile.of(context, c, onTap: () => _openBrowse(categoryId: c.id, title: c.name(t.isBn))),
            CategoryTile(label: t.t('all'), icon: Icons.apps_rounded, onTap: widget.goToCategories),
          ],
        ),
      ),
    ];
  }

  List<Widget> _shelf(BuildContext context, Shelf s, bool bn, LocaleController t) {
    const cardWidth = 150.0;
    return [
      _sectionTitle(
        s.title(bn),
        action: TextButton(
          onPressed: () => _openBrowse(categoryId: s.categoryId, title: s.title(bn), onSale: s.onSale),
          child: Text(t.t('see_all')),
        ),
      ),
      SizedBox(
        height: shelfHeight(context, cardWidth),
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: s.items.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, i) => SizedBox(width: cardWidth, child: ProductCard(product: s.items[i], onTap: () => _openProduct(s.items[i]))),
        ),
      ),
    ];
  }

  Widget _sectionTitle(String title, {Widget? action}) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
        child: Row(children: [
          Expanded(child: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, letterSpacing: -0.2))),
          ?action,
        ]),
      );
}

class _SearchBox extends StatelessWidget {
  const _SearchBox({required this.hint, required this.onTap});
  final String hint;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Semantics(
          button: true,
          label: hint,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              height: 48,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: kLine)),
              child: Row(children: [
                const Icon(Icons.search, color: kMuted),
                const SizedBox(width: 10),
                Expanded(child: Text(hint, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: kMuted))),
              ]),
            ),
          ),
        ),
      );
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.index});
  final int count;
  final int index;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          for (var i = 0; i < count; i++)
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == index ? 18 : 6,
              height: 6,
              decoration: BoxDecoration(color: i == index ? kAction : const Color(0xFFC5D0C0), borderRadius: BorderRadius.circular(3)),
            ),
        ]),
      );
}

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();
  @override
  Widget build(BuildContext context) {
    return ListView(physics: const NeverScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 0), children: [
      const Skeleton(height: 48, radius: 12),
      const SizedBox(height: 14),
      const Skeleton(height: 150, radius: 14),
      const SizedBox(height: 18),
      const Skeleton(width: 120, height: 18),
      const SizedBox(height: 12),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [for (var i = 0; i < 4; i++) const Skeleton(width: 58, height: 58, radius: 29)]),
      const SizedBox(height: 22),
      const Skeleton(width: 150, height: 18),
      const SizedBox(height: 12),
      const Row(children: [
        Expanded(child: ProductCardSkeleton()),
        SizedBox(width: 12),
        Expanded(child: ProductCardSkeleton()),
      ]),
    ]);
  }
}

class _AdTile extends StatelessWidget {
  const _AdTile({required this.ad});
  final AdBanner ad;
  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: ad.storeSlug == null ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => StorePage(slug: ad.storeSlug!, title: ad.headline))),
          child: Stack(fit: StackFit.expand, children: [
            NetImage(ad.imageUrl),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(12, 18, 12, 10),
                decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.transparent, Colors.black87])),
                child: Text(ad.headline, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
              ),
            ),
            Positioned(
              top: 8,
              left: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(6)),
                child: Text(t.t('sponsored'), style: const TextStyle(color: Colors.white, fontSize: 10)),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _StoreTile extends StatelessWidget {
  const _StoreTile({required this.store});
  final StoreCardData store;
  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    return SizedBox(
      width: 170,
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StorePage(slug: store.slug, title: store.name))),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.storefront_outlined, color: Color(0xFF123B32)),
              const Spacer(),
              Text(store.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(t.t('products_count', {'n': '${store.productCount}'}), style: const TextStyle(color: kMuted, fontSize: 12)),
            ]),
          ),
        ),
      ),
    );
  }
}
