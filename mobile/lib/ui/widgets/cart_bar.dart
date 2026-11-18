import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../theme.dart';
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
        color: kBrand,
        borderRadius: BorderRadius.circular(14),
        elevation: 3,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              const Icon(Icons.shopping_bag_outlined, color: kLime),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '${t.t('items_n', {'n': toBnIf(t.isBn, '${cart.count}')})} · ${formatMoney(cart.total, bn: t.isBn)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(t.t('view_bag'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: kLime, fontWeight: FontWeight.w700)),
              ),
              const Icon(Icons.chevron_right, color: kLime),
            ]),
          ),
        ),
      ),
    );
  }
}
