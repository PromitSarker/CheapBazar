import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import 'auth_screen.dart';
import 'checkout_screen.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key, required this.goToShop});
  final VoidCallback goToShop;

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final cart = context.watch<CartController>();
    final groups = cart.groups;
    return Scaffold(
      appBar: AppBar(title: Text(t.t('bag'))),
      body: groups.isEmpty
          ? EmptyState(
              icon: Icons.shopping_bag_outlined,
              title: t.t('bag_empty'),
              subtitle: t.t('bag_empty_hint'),
              action: SizedBox(width: 220, child: FilledButton(onPressed: goToShop, child: Text(t.t('start_shopping')))),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: groups.length,
              separatorBuilder: (_, _) => const SizedBox(height: 14),
              itemBuilder: (_, i) => _GroupCard(group: groups[i]),
            ),
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.group});
  final CartGroup group;

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final cart = context.read<CartController>();
    final wholesale = group.orderType == 'WHOLESALE';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.storefront_outlined, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text(group.storeName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
            if (wholesale)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: const Color(0xFFEAF4EC), borderRadius: BorderRadius.circular(10)),
                child: Text(t.t('wholesale'), style: const TextStyle(color: Color(0xFF123B32), fontSize: 11, fontWeight: FontWeight.w700)),
              ),
          ]),
          const Divider(height: 22),
          for (final l in group.lines) _LineRow(line: l),
          const SizedBox(height: 8),
          Row(children: [
            Text(t.t('subtotal'), style: const TextStyle(color: Color(0xFF4F6159))),
            const Spacer(),
            Money(group.total, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () async {
              if (wholesale && !context.read<SessionController>().loggedIn) {
                await Navigator.push(context, MaterialPageRoute(builder: (_) => const AuthScreen()));
                if (!context.mounted || !context.read<SessionController>().loggedIn) return;
              }
              if (!context.mounted) return;
              Navigator.push(context, MaterialPageRoute(builder: (_) => CheckoutScreen(group: group)));
            },
            child: Text('${t.t('checkout')} · ${formatMoney(group.total, bn: t.isBn)}'),
          ),
          TextButton(
            onPressed: () => cart.removeGroup(group.storeSlug, group.orderType),
            child: Text(t.t('remove')),
          ),
        ]),
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line});
  final CartLine line;
  @override
  Widget build(BuildContext context) {
    final cart = context.read<CartController>();
    final min = line.isWholesale ? line.moq : 1;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 60, height: 60, child: NetImage(line.image, radius: 10)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(line.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Money(line.effectiveUnit, style: const TextStyle(color: Color(0xFF4F6159))),
            Row(children: [
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: line.quantity > min ? () => cart.setQuantity(line, line.quantity - 1) : null,
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Text('${line.quantity}', style: const TextStyle(fontWeight: FontWeight.w700)),
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: line.quantity < line.maxStock ? () => cart.setQuantity(line, line.quantity + 1) : null,
                icon: const Icon(Icons.add_circle_outline),
              ),
              const Spacer(),
              IconButton(visualDensity: VisualDensity.compact, onPressed: () => cart.remove(line), icon: const Icon(Icons.delete_outline, color: Color(0xFFDC2626))),
            ]),
          ]),
        ),
      ]),
    );
  }
}
