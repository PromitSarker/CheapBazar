import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/l10n.dart';
import '../widgets/common.dart';
import '../widgets/location_ui.dart';
import '../widgets/product_card.dart';
import 'product_page.dart';

class StorePage extends StatefulWidget {
  const StorePage({super.key, required this.slug, this.title});
  final String slug;
  final String? title;

  @override
  State<StorePage> createState() => _StorePageState();
}

class _StorePageState extends State<StorePage> {
  late Future<Map<String, dynamic>> _future = _load();

  Future<Map<String, dynamic>> _load() async =>
      (await context.read<ApiClient>().get('/stores/${Uri.encodeComponent(widget.slug)}')) as Map<String, dynamic>;

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    return Scaffold(
      appBar: AppBar(title: Text(widget.title ?? widget.slug)),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          final err = snap.error;
          if (err is ApiException && (err.code == 'OUT_OF_RANGE' || err.code == 'LOCATION_REQUIRED' || err.code == 'SHOP_HAS_NO_LOCATION')) {
            return LocationPrompt(message: err.message); // the shop is outside the buyer's range, or their location is unknown
          }
          if (snap.hasError) return ErrorRetry(message: errorText(snap.error!), onRetry: () => setState(() => _future = _load()));
          final d = snap.data!;
          final store = (d['store'] as Map).cast<String, dynamic>();
          final name = '${store['name']}';
          final accepts = store['acceptsOrders'] == true;
          final products = ((d['products'] as List?) ?? const [])
              .map((e) => Product.fromStore((e as Map).cast<String, dynamic>(), '${store['slug']}', name))
              .toList();
          final banner = d['banner'] == null ? null : AdBanner.fromJson((d['banner'] as Map).cast<String, dynamic>());
          return RefreshIndicator(
            onRefresh: () async {
              setState(() => _future = _load());
              await _future.catchError((_) => <String, dynamic>{});
            },
            child: CustomScrollView(slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                  child: Row(children: [
                    const CircleAvatar(radius: 24, backgroundColor: Color(0xFF123B32), child: Icon(Icons.storefront, color: Colors.white)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                        Text(t.t('products_count', {'n': '${products.length}'}), style: const TextStyle(color: Color(0xFF5C6B64))),
                      ]),
                    ),
                  ]),
                ),
              ),
              if (!accepts)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10)),
                      child: Text(t.t('store_not_accepting'), style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w600)),
                    ),
                  ),
                ),
              if (banner != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: SizedBox(
                      height: 110,
                      child: Card(
                        clipBehavior: Clip.antiAlias,
                        child: Stack(fit: StackFit.expand, children: [
                          NetImage(banner.imageUrl),
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: Container(
                              padding: const EdgeInsets.fromLTRB(10, 14, 10, 8),
                              decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.transparent, Colors.black87])),
                              child: Text('${t.t('sponsored')} · ${banner.headline}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 13)),
                            ),
                          ),
                        ]),
                      ),
                    ),
                  ),
                ),
              if (products.isEmpty)
                SliverFillRemaining(hasScrollBody: false, child: EmptyState(icon: Icons.inventory_2_outlined, title: t.t('no_orders')))
              else
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverGrid.builder(
                    itemCount: products.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.78),
                    itemBuilder: (_, i) => ProductCard(
                      product: products[i],
                      showStore: false,
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductPage(product: products[i]))),
                    ),
                  ),
                ),
            ]),
          );
        },
      ),
    );
  }
}
