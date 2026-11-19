import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../theme.dart';
import '../icons.dart';
import 'product_card.dart' show toBnIf;

/// Sticky "2 items · ৳340  View bag ›" strip above the bottom navigation. Hidden when the bag is empty.
class CartBar extends StatelessWidget {
  const CartBar({super.key, required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    final t = context.watch<LocaleController>();
    if (cart.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: Material(
        color: kMint,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius), side: const BorderSide(color: kLine)),
        elevation: 0,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(kRadius),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              const Icon(Zi.bag, color: kBrand),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '${t.t(cart.count == 1 ? 'item_one' : 'items_n', {'n': toBnIf(t.isBn, '${cart.count}')})} · ${formatMoney(cart.total, bn: t.isBn)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: kInk, fontWeight: FontWeight.w500),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(t.t('view_bag'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: kBrand, fontWeight: FontWeight.w500)),
              ),
              const Icon(Zi.chevron, color: kBrand),
            ]),
          ),
        ),
      ),
    );
  }
}
