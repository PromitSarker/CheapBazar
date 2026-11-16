import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../theme.dart';
import 'common.dart';

/// Height of everything under the square image (name, subtitle, price, action) at normal text size.
const double _kInfoHeight = 144;

String _kmText(double km, bool bn) {
  final s = km < 10 ? km.toStringAsFixed(1) : km.round().toString();
  return bn ? toBnDigits(s) : s;
}

double _textScale(BuildContext context) => MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6);

/// Grid delegate whose cell height follows the cell width and the user's text size, so big fonts never overflow.
SliverGridDelegate productGridDelegate(BuildContext context, {int columns = 2, double spacing = 12, double sidePadding = 16}) {
  final w = MediaQuery.sizeOf(context).width;
  final cell = (w - sidePadding * 2 - spacing * (columns - 1)) / columns;
  return SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: columns,
    mainAxisSpacing: spacing,
    crossAxisSpacing: spacing,
    mainAxisExtent: cell + _kInfoHeight * _textScale(context),
  );
}

/// Height for a horizontal shelf of cards of the given [width].
double shelfHeight(BuildContext context, double width) => width + _kInfoHeight * _textScale(context);

class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product, required this.onTap, this.showStore = true});
  final Product product;
  final VoidCallback onTap;
  final bool showStore;

  @override
  Widget build(BuildContext context) {
    final p = product;
    final t = context.watch<LocaleController>();
    final sub = p.subtitle;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AspectRatio(
            aspectRatio: 1,
            child: Stack(fit: StackFit.expand, children: [
              NetImage(p.image),
              if (p.onSale && p.inStock)
                Positioned(top: 8, left: 8, child: _Badge(t.t('off_pct', {'n': toBnIf(t.isBn, '${p.discountPct}')}))),
              if (!p.inStock && !p.locked)
                Container(
                  color: Colors.white70,
                  alignment: Alignment.center,
                  child: Text(t.t('out_of_stock'), style: const TextStyle(color: Color(0xFF3F3F46), fontWeight: FontWeight.w700)),
                ),
            ]),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.2, fontSize: 13.5)),
                if (sub.isNotEmpty)
                  Padding(padding: const EdgeInsets.only(top: 2), child: Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: kMuted, fontSize: 12)))
                else if (showStore && p.storeName.isNotEmpty)
                  Padding(padding: const EdgeInsets.only(top: 2), child: Text(p.distanceKm == null ? p.storeName : '${p.storeName} · ${t.t('km_away', {'km': _kmText(p.distanceKm!, t.isBn)})}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: kMuted, fontSize: 12))),
                const Spacer(),
                _priceAndAction(context, t),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _priceAndAction(BuildContext context, LocaleController t) {
    final p = product;
    if (p.locked) {
      return Row(children: [
        const Icon(Icons.lock_outline, size: 16, color: kMuted),
        const SizedBox(width: 4),
        Text(t.t('wholesale'), style: const TextStyle(color: kMuted, fontSize: 13)),
      ]);
    }
    if (p.wholesale) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Money(p.wholesalePrice ?? 0, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        Text(t.t('min_order_qty', {'n': '${p.moq}'}), style: const TextStyle(color: kMuted, fontSize: 11)),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Money(p.price, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          if (p.onSale) ...[
            const SizedBox(width: 6),
            Money(p.compareAtPrice!, style: const TextStyle(color: kMuted, fontSize: 12, decoration: TextDecoration.lineThrough)),
          ],
        ]),
      ),
      const SizedBox(height: 6),
      if (p.inStock) AddControl(product: p) else const SizedBox(height: 40),
    ]);
  }
}

String toBnIf(bool bn, String s) => bn ? toBnDigits(s) : s;

class _Badge extends StatelessWidget {
  const _Badge(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(color: kSale, borderRadius: BorderRadius.circular(6)),
        child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
      );
}

/// "ADD" that turns into a - 2 + stepper once the product is in the bag. Retail items only;
/// wholesale needs a minimum quantity, so it goes through the product page.
class AddControl extends StatelessWidget {
  const AddControl({super.key, required this.product});
  final Product product;

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();
    final t = context.watch<LocaleController>();
    final qty = cart.quantityOf(product.id);
    final max = product.stock > 0 ? product.stock : 9999;

    if (qty == 0) {
      return SizedBox(
        height: 40,
        width: double.infinity,
        child: OutlinedButton(
          onPressed: () => cart.add(product),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(0, 40),
            padding: EdgeInsets.zero,
            foregroundColor: kAction,
            side: const BorderSide(color: kAction, width: 1.4),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
          ),
          child: Text(t.t('add')),
        ),
      );
    }
    return Container(
      height: 40,
      decoration: BoxDecoration(color: kAction, borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        _StepButton(icon: Icons.remove, label: t.t('remove_one'), onTap: () => cart.decrement(product.id)),
        Expanded(
          child: Text(toBnIf(t.isBn, '$qty'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
        ),
        _StepButton(icon: Icons.add, label: t.t('add_one'), onTap: qty < max ? () => cart.add(product) : null),
      ]),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(width: 40, height: 40, child: Icon(icon, size: 20, color: onTap == null ? Colors.white54 : Colors.white)),
        ),
      );
}
