import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/l10n.dart';
import 'common.dart';

class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product, required this.onTap, this.showStore = true});
  final Product product;
  final VoidCallback onTap;
  final bool showStore;

  @override
  Widget build(BuildContext context) {
    final p = product;
    final t = context.watch<LocaleController>();
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AspectRatio(
            aspectRatio: 1.25,
            child: Stack(fit: StackFit.expand, children: [
              NetImage(p.image),
              if (!p.inStock && !p.locked)
                Container(
                  color: Colors.black45,
                  alignment: Alignment.center,
                  child: Text(t.t('out_of_stock'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.2)),
              if (showStore && p.storeName.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(p.storeName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFF71717A), fontSize: 12)),
              ],
              const SizedBox(height: 6),
              if (p.locked)
                Row(children: [
                  const Icon(Icons.lock_outline, size: 16, color: Color(0xFF71717A)),
                  const SizedBox(width: 4),
                  Text(t.t('wholesale'), style: const TextStyle(color: Color(0xFF71717A), fontSize: 13)),
                ])
              else if (p.wholesale)
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Money(p.wholesalePrice ?? 0, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  Text(t.t('min_order_qty', {'n': '${p.moq}'}), style: const TextStyle(color: Color(0xFF71717A), fontSize: 11)),
                ])
              else
                Money(p.price, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            ]),
          ),
        ]),
      ),
    );
  }
}
