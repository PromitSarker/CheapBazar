import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../../state/catalog.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/product_card.dart';
import 'browse_screen.dart';
import 'auth_screen.dart';
import 'pro_screen.dart';
import 'store_page.dart';

class ProductPage extends StatefulWidget {
  const ProductPage({super.key, required this.product, this.paywallReason});
  final Product product;

  /// LOGIN_REQUIRED | BUYER_PRO_REQUIRED when the wholesale price is hidden.
  final String? paywallReason;

  @override
  State<ProductPage> createState() => _ProductPageState();
}

class _ProductPageState extends State<ProductPage> {
  late int qty = widget.product.wholesale ? widget.product.moq : 1;
  Product? _fresh; // the listing as the server sees it right now (price, stock, paywall)
  String? _freshPaywall;
  List<Product> _similar = const [];

  Product get _p => _fresh ?? widget.product;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  /// The list the shopper tapped may be minutes old; fetch the live listing and similar products.
  /// Failure is silent: the page already shows what the list had.
  Future<void> _refresh() async {
    try {
      final r = (await context.read<ApiClient>().get('/products/${Uri.encodeComponent(widget.product.id)}')) as Map<String, dynamic>;
      if (!mounted) return;
      final wholesale = r['tab'] == 'wholesale';
      final fresh = Product.fromBrowse((r['item'] as Map).cast<String, dynamic>(), wholesale: wholesale);
      final pw = r['paywall'] as Map?;
      setState(() {
        _fresh = fresh;
        _freshPaywall = (pw != null && pw['locked'] == true) ? '${pw['reason']}' : null;
        _similar = ((r['similar'] as List?) ?? const []).map((e) => Product.fromBrowse((e as Map).cast<String, dynamic>())).toList();
        if (qty > fresh.stock && fresh.stock > 0) qty = fresh.stock;
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    final t = context.watch<LocaleController>();
    final max = p.stock > 0 ? p.stock : 9999;
    final min = p.wholesale ? p.moq : 1;
    final canBuy = p.inStock && !p.locked;

    return Scaffold(
      appBar: AppBar(title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: ListView(children: [
        _Gallery(images: p.gallery, badge: p.onSale ? t.t('off_pct', {'n': toBnIf(t.isBn, '${p.discountPct}')}) : null),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(p.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            if (p.subtitle.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(p.subtitle, style: const TextStyle(color: kMuted, fontSize: 14))),
            _Breadcrumb(categoryId: p.categoryId),
            const SizedBox(height: 4),
            if (p.storeSlug.isNotEmpty)
              InkWell(
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StorePage(slug: p.storeSlug, title: p.storeName))),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.storefront_outlined, size: 18, color: Color(0xFF4F6159)),
                    const SizedBox(width: 6),
                    Text(p.storeName, style: const TextStyle(color: Color(0xFF4F6159), decoration: TextDecoration.underline)),
                  ]),
                ),
              ),
            const SizedBox(height: 10),
            if (p.locked) _lockedBox(context, t)
            else if (p.wholesale) _wholesalePrice(t, p)
            else _retailPrice(t, p),
            const SizedBox(height: 8),
            if (!p.locked)
              Text(
                !p.inStock ? t.t('out_of_stock') : (p.stock > 0 && p.stock <= 5 ? t.t('only_left', {'n': '${p.stock}'}) : t.t('in_stock')),
                style: TextStyle(color: p.inStock ? const Color(0xFF1E7A57) : const Color(0xFFDC2626), fontWeight: FontWeight.w600),
              ),
            if (p.description.trim().isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(p.description, style: const TextStyle(height: 1.45, color: Color(0xFF3B4F46))),
            ],
          ]),
        ),
        if (_similar.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Text(t.t('similar_products'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          ),
          SizedBox(
            height: shelfHeight(context, 150),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _similar.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (_, i) => SizedBox(
                width: 150,
                child: ProductCard(product: _similar[i], onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductPage(product: _similar[i])))),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ]),
      bottomNavigationBar: canBuy
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(children: [
                  Container(
                    decoration: BoxDecoration(border: Border.all(color: const Color(0xFFC5D0C0)), borderRadius: BorderRadius.circular(12)),
                    child: Row(children: [
                      IconButton(onPressed: qty > min ? () => setState(() => qty--) : null, icon: const Icon(Icons.remove)),
                      SizedBox(width: 34, child: Text('$qty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                      IconButton(onPressed: qty < max ? () => setState(() => qty++) : null, icon: const Icon(Icons.add)),
                    ]),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () {
                        context.read<CartController>().add(p, qty: qty);
                        showSnack(context, t.t('added_to_bag'));
                        Navigator.pop(context);
                      },
                      icon: const Icon(Icons.shopping_bag_outlined),
                      label: Text(t.t('add_to_bag')),
                    ),
                  ),
                ]),
              ),
            )
          : null,
    );
  }

  Widget _retailPrice(LocaleController t, Product p) {
    if (!p.onSale) return Money(p.price, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Money(p.price, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
        const SizedBox(width: 10),
        Money(p.compareAtPrice!, style: const TextStyle(fontSize: 16, color: kMuted, decoration: TextDecoration.lineThrough)),
      ]),
      const SizedBox(height: 4),
      Text(t.t('you_save', {'amt': formatMoney(p.compareAtPrice! - p.price, bn: t.isBn)}), style: const TextStyle(color: kAction, fontWeight: FontWeight.w700)),
    ]);
  }

  Widget _wholesalePrice(LocaleController t, Product p) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(t.t('wholesale_price'), style: const TextStyle(color: Color(0xFF5C6B64), fontSize: 12)),
      Money(p.wholesalePrice ?? 0, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
      const SizedBox(height: 4),
      Text(t.t('min_order_qty', {'n': '${p.moq}'}), style: const TextStyle(color: Color(0xFF4F6159))),
      if (p.tiers.isNotEmpty) ...[
        const SizedBox(height: 10),
        Text(t.t('volume_prices'), style: const TextStyle(fontWeight: FontWeight.w700)),
        for (final tier in p.tiers)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(children: [
              Text(t.t('from_qty', {'n': '${tier.minQty}'})),
              const SizedBox(width: 10),
              Money(tier.unitPrice),
            ]),
          ),
      ],
    ]);
  }

  Widget _lockedBox(BuildContext context, LocaleController t) {
    final reason = _freshPaywall ?? widget.paywallReason;
    final needLogin = reason == 'LOGIN_REQUIRED' || !context.read<SessionController>().loggedIn;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: const Color(0xFFE8EFE6), borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.lock_outline),
          const SizedBox(width: 8),
          Expanded(child: Text(needLogin ? t.t('wholesale_locked_login') : t.t('wholesale_locked_pro'), style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
        const SizedBox(height: 10),
        FilledButton(
          onPressed: () async {
            if (needLogin) {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const AuthScreen()));
            } else {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const ProScreen()));
            }
          },
          child: Text(needLogin ? t.t('login') : t.t('get_buyer_pro')),
        ),
      ]),
    );
  }
}

/// Swipeable picture gallery with dots and the discount badge.
class _Gallery extends StatefulWidget {
  const _Gallery({required this.images, this.badge});
  final List<String> images;
  final String? badge;
  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _i = 0;
  @override
  Widget build(BuildContext context) {
    final imgs = widget.images;
    return AspectRatio(
      aspectRatio: 1.1,
      child: Stack(fit: StackFit.expand, children: [
        if (imgs.length <= 1)
          NetImage(imgs.isEmpty ? null : imgs.first)
        else
          PageView.builder(itemCount: imgs.length, onPageChanged: (i) => setState(() => _i = i), itemBuilder: (_, i) => NetImage(imgs[i])),
        if (widget.badge != null)
          Positioned(
            top: 12,
            left: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: kSale, borderRadius: BorderRadius.circular(8)),
              child: Text(widget.badge!, style: const TextStyle(color: kInk, fontWeight: FontWeight.w800, fontSize: 12)),
            ),
          ),
        if (imgs.length > 1)
          Positioned(
            bottom: 10,
            left: 0,
            right: 0,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var k = 0; k < imgs.length; k++)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: k == _i ? 16 : 6,
                  height: 6,
                  decoration: BoxDecoration(color: k == _i ? Colors.white : Colors.white60, borderRadius: BorderRadius.circular(3)),
                ),
            ]),
          ),
      ]),
    );
  }
}

/// "Grocery & Food › Fruits": each part opens that category.
class _Breadcrumb extends StatelessWidget {
  const _Breadcrumb({required this.categoryId});
  final String? categoryId;
  @override
  Widget build(BuildContext context) {
    final bn = context.watch<LocaleController>().isBn;
    final trail = context.watch<CatalogController>().trail(categoryId);
    if (trail.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
        for (var i = 0; i < trail.length; i++) ...[
          if (i > 0) const Padding(padding: EdgeInsets.symmetric(horizontal: 4), child: Icon(Icons.chevron_right, size: 16, color: kMuted)),
          InkWell(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BrowseScreen(categoryId: trail[i].id, title: trail[i].name(bn)))),
            child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(trail[i].name(bn), style: const TextStyle(color: kAction, fontWeight: FontWeight.w600, fontSize: 13))),
          ),
        ],
      ]),
    );
  }
}
