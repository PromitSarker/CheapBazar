import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
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

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final t = context.watch<LocaleController>();
    final max = p.stock > 0 ? p.stock : 9999;
    final min = p.wholesale ? p.moq : 1;
    final canBuy = p.inStock && !p.locked;

    return Scaffold(
      appBar: AppBar(title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: ListView(children: [
        AspectRatio(aspectRatio: 1.2, child: NetImage(p.image)),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(p.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            if (p.storeSlug.isNotEmpty)
              InkWell(
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StorePage(slug: p.storeSlug, title: p.storeName))),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.storefront_outlined, size: 18, color: Color(0xFF52525B)),
                    const SizedBox(width: 6),
                    Text(p.storeName, style: const TextStyle(color: Color(0xFF52525B), decoration: TextDecoration.underline)),
                  ]),
                ),
              ),
            const SizedBox(height: 10),
            if (p.locked) _lockedBox(context, t)
            else if (p.wholesale) _wholesalePrice(t, p)
            else Money(p.price, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            if (!p.locked)
              Text(
                !p.inStock ? t.t('out_of_stock') : (p.stock > 0 && p.stock <= 5 ? t.t('only_left', {'n': '${p.stock}'}) : t.t('in_stock')),
                style: TextStyle(color: p.inStock ? const Color(0xFF16A34A) : const Color(0xFFDC2626), fontWeight: FontWeight.w600),
              ),
            if (p.description.trim().isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(p.description, style: const TextStyle(height: 1.45, color: Color(0xFF3F3F46))),
            ],
          ]),
        ),
      ]),
      bottomNavigationBar: canBuy
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(children: [
                  Container(
                    decoration: BoxDecoration(border: Border.all(color: const Color(0xFFD4D4D8)), borderRadius: BorderRadius.circular(12)),
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

  Widget _wholesalePrice(LocaleController t, Product p) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(t.t('wholesale_price'), style: const TextStyle(color: Color(0xFF71717A), fontSize: 12)),
      Money(p.wholesalePrice ?? 0, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
      const SizedBox(height: 4),
      Text(t.t('min_order_qty', {'n': '${p.moq}'}), style: const TextStyle(color: Color(0xFF52525B))),
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
    final needLogin = widget.paywallReason == 'LOGIN_REQUIRED' || !context.read<SessionController>().loggedIn;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: const Color(0xFFF4F4F5), borderRadius: BorderRadius.circular(12)),
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
