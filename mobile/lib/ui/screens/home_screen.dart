import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import '../widgets/product_card.dart';
import 'auth_screen.dart';
import 'notifications_screen.dart';
import 'product_page.dart';
import 'store_page.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.goToShop});
  final void Function({String? query}) goToShop;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<Map<String, dynamic>> _future = _load();
  final _page = PageController(viewportFraction: 0.92);

  Future<Map<String, dynamic>> _load() async => (await context.read<ApiClient>().get('/home')) as Map<String, dynamic>;

  Future<void> _reload() async {
    setState(() => _future = _load());
    await _future.catchError((_) => <String, dynamic>{});
    if (mounted) context.read<SessionController>().refreshUnread();
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final session = context.watch<SessionController>();
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(color: const Color(0xFF18181B), borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.shopping_bag, color: Colors.white, size: 18),
          ),
          const SizedBox(width: 10),
          Text(t.t('app_name')),
        ]),
        actions: [
          IconButton(
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
        child: FutureBuilder<Map<String, dynamic>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (snap.hasError) {
              return ListView(children: [
                SizedBox(height: 420, child: ErrorRetry(message: errorText(snap.error!), onRetry: _reload)),
              ]);
            }
            final d = snap.data!;
            final ads = ((d['ads'] as List?) ?? const []).map((e) => AdBanner.fromJson((e as Map).cast<String, dynamic>())).toList();
            final stores = ((d['stores'] as List?) ?? const []).map((e) => StoreCardData.fromJson((e as Map).cast<String, dynamic>())).toList();
            final items = ((d['items'] as List?) ?? const []).map((e) => Product.fromBrowse((e as Map).cast<String, dynamic>())).toList();
            return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: InkWell(
                  onTap: () => widget.goToShop(),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFD4D4D8))),
                    child: Row(children: [
                      const Icon(Icons.search, color: Color(0xFF71717A)),
                      const SizedBox(width: 10),
                      Expanded(child: Text(t.t('search_hint'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFF71717A)))),
                    ]),
                  ),
                ),
              ),
              if (ads.isNotEmpty) ...[
                SizedBox(
                  height: 160,
                  child: PageView.builder(
                    controller: _page,
                    itemCount: ads.length,
                    itemBuilder: (_, i) => _AdTile(ad: ads[i]),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              if (stores.isNotEmpty) ...[
                _sectionTitle(t.t('stores')),
                SizedBox(
                  height: 118,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: stores.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 10),
                    itemBuilder: (_, i) => _StoreTile(store: stores[i]),
                  ),
                ),
              ],
              if (items.isNotEmpty) ...[
                _sectionTitle(t.t('fresh_picks'), action: TextButton(onPressed: () => widget.goToShop(), child: Text(t.t('see_all')))),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: items.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.72),
                    itemBuilder: (_, i) => ProductCard(
                      product: items[i],
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductPage(product: items[i]))),
                    ),
                  ),
                ),
              ],
              if (stores.isEmpty && items.isEmpty) SizedBox(height: 320, child: EmptyState(icon: Icons.storefront_outlined, title: t.t('no_orders'))),
            ]);
          },
        ),
      ),
    );
  }

  Widget _sectionTitle(String title, {Widget? action}) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 8, 8),
        child: Row(children: [
          Expanded(child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
          ?action,
        ]),
      );
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
                decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(10)),
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
              const Icon(Icons.storefront_outlined, color: Color(0xFF18181B)),
              const Spacer(),
              Text(store.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(t.t('products_count', {'n': '${store.productCount}'}), style: const TextStyle(color: Color(0xFF71717A), fontSize: 12)),
            ]),
          ),
        ),
      ),
    );
  }
}
