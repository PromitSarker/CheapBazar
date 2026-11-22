import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../theme.dart';
import '../icons.dart';
import 'common.dart';

/// Height of everything under the square image (name, subtitle, price, action) at normal text size.
const double _kInfoHeight = 138;

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
    // Borderless card: the photo carries it, text sits straight on the page background.
    return Card(
      color: Colors.transparent,
      clipBehavior: Clip.none,
      shape: const RoundedRectangleBorder(),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(kRadius),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AspectRatio(
            aspectRatio: 1,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(kRadius),
              child: Stack(fit: StackFit.expand, children: [
              NetImage(p.image),
              if (p.onSale && p.inStock)
                Positioned(top: 8, left: 8, child: _Badge(t.t('off_pct', {'n': toBnIf(t.isBn, '${p.discountPct}')}))),
              if (!p.inStock && !p.locked)
                Container(
                  color: Colors.white70,
                  alignment: Alignment.center,
                  child: Text(t.t('out_of_stock'), style: const TextStyle(color: Color(0xFF4A463F), fontWeight: FontWeight.w600)),
                ),
              ]),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(2, 8, 2, 4),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w400, height: 1.3, fontSize: 13.5)),
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
        const Icon(Zi.lock, size: 16, color: kMuted),
        const SizedBox(width: 4),
        Text(t.t('wholesale'), style: const TextStyle(color: kMuted, fontSize: 13)),
      ]);
    }
    if (p.wholesale) {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Money(p.wholesalePrice ?? 0, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        Text(t.t('min_order_qty', {'n': '${p.moq}'}), style: const TextStyle(color: kMuted, fontSize: 11)),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Money(p.price, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: p.onSale ? kClay : kInk)),
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
        decoration: BoxDecoration(color: kSale, borderRadius: BorderRadius.circular(4)),
        child: Text(text, style: const TextStyle(color: kClay, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.2)),
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
            backgroundColor: Colors.transparent,
            foregroundColor: kBrand,
            side: const BorderSide(color: kLineStrong, width: 1),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius)),
            textStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, letterSpacing: 0.3),
          ),
          child: Text(t.t('add')),
        ),
      );
    }
    return Container(
      height: 40,
      decoration: BoxDecoration(color: kMint, border: Border.all(color: kLine, width: 1), borderRadius: BorderRadius.circular(kRadius)),
      child: Row(children: [
        _StepButton(icon: Zi.remove, label: t.t('remove_one'), onTap: () => cart.decrement(product.id)),
        Expanded(
          child: Text(toBnIf(t.isBn, '$qty'), textAlign: TextAlign.center, style: const TextStyle(color: kBrand, fontWeight: FontWeight.w600, fontSize: 15)),
        ),
        _StepButton(icon: Zi.add, label: t.t('add_one'), onTap: qty < max ? () => cart.add(product) : null),
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
          borderRadius: BorderRadius.circular(kRadius),
          child: SizedBox(width: 40, height: 40, child: Icon(icon, size: 20, color: onTap == null ? const Color(0x663B4733) : kBrand)),
        ),
      );
}
