import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/l10n.dart';
import '../category_icons.dart';
import '../theme.dart';
import 'common.dart' show NetImage;
import 'product_card.dart' show toBnIf;

/// Soft, earthy card backgrounds (MUJI-ish). Every one carries dark kInk text at > 10:1 contrast.
/// The picture is tinted from the same family, so it supports the name and never competes with it.
const List<(Color bg, Color tint)> kZenTones = [
  (Color(0xFFEFE6D8), Color(0xFFB9A585)), // oat
  (Color(0xFFDDE6D6), Color(0xFF8DA282)), // sage
  (Color(0xFFEBD9CE), Color(0xFFC09A86)), // clay
  (Color(0xFFE4E4DC), Color(0xFFA3A394)), // stone
  (Color(0xFFD9E5E1), Color(0xFF86A39B)), // mist
  (Color(0xFFF1E4C9), Color(0xFFC8A864)), // straw
];

/// Two columns, staggered: a tall card sits beside a short one and the pattern flips every row.
/// Heights are fixed ratios of the column width (not content) so rows stay even on every phone.
class ZenCategoryGrid extends StatelessWidget {
  const ZenCategoryGrid({super.key, required this.items, required this.onOpen, this.leading, this.padding = const EdgeInsets.fromLTRB(16, 4, 16, 28)});

  final List<ShopCategory> items;
  final void Function(ShopCategory) onOpen;

  /// Optional first card (the All-department shortcut on a sub-category page).
  final Widget Function(double height)? leading;
  final EdgeInsets padding;

  static const double gap = 12;
  static const double tallRatio = 1.22; // height / width
  static const double shortRatio = 0.92;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final w = (box.maxWidth - padding.horizontal - gap) / 2;
      final cards = <Widget>[
        if (leading != null) leading!(w * shortRatio),
        for (var i = 0; i < items.length; i++)
          ZenCategoryCard(
            category: items[i],
            tone: kZenTones[i % kZenTones.length],
            height: w * _ratio(i + (leading != null ? 1 : 0)),
            onTap: () => onOpen(items[i]),
          ),
      ];
      final left = <Widget>[], right = <Widget>[];
      for (var i = 0; i < cards.length; i++) {
        (i.isEven ? left : right).add(Padding(padding: const EdgeInsets.only(bottom: gap), child: cards[i]));
      }
      return Padding(
        padding: padding,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: left)),
          const SizedBox(width: gap),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: right)),
        ]),
      );
    });
  }

  /// Row r is i ~/ 2: even rows are tall-left / short-right, odd rows flip.
  static double _ratio(int i) => ((i ~/ 2) + (i % 2)).isEven ? tallRatio : shortRatio;
}

class ZenCategoryCard extends StatelessWidget {
  const ZenCategoryCard({super.key, required this.category, required this.tone, required this.height, required this.onTap});
  final ShopCategory category;
  final (Color bg, Color tint) tone;
  final double height;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final bn = t.isBn;
    final c = category;
    final label = c.name(bn);
    final hasPhoto = c.imageUrl.isNotEmpty;
    return Semantics(
      button: true,
      label: label,
      child: SizedBox(
        height: height,
        child: Material(
          color: tone.$1,
          borderRadius: BorderRadius.circular(20),
          clipBehavior: Clip.antiAlias,
          // The whole card is the tap target (ink ripple included), not just the label.
          child: InkWell(
            onTap: onTap,
            child: Stack(children: [
              // Picture: always anchored bottom-right, same box size on every card.
              Positioned(
                right: hasPhoto ? 8 : 6,
                bottom: hasPhoto ? 8 : 6,
                width: height * 0.62,
                height: height * 0.62,
                child: ExcludeSemantics(
                  child: hasPhoto
                      ? NetImage(c.imageUrl, fit: BoxFit.contain, icon: categoryIcon(c.icon))
                      : Icon(categoryIcon(c.icon), size: height * 0.5, color: tone.$2.withValues(alpha: 0.55)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 14, 14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, height: 1.25, fontWeight: FontWeight.w700, color: kInk, letterSpacing: 0.1)),
                  if (c.count > 0) ...[
                    const SizedBox(height: 4),
                    Text(t.t('products_count', {'n': toBnIf(bn, '${c.count}')}), style: const TextStyle(fontSize: 12, color: Color(0xFF55635C), fontWeight: FontWeight.w500)),
                  ],
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// All-department shortcut card for a sub-category page: quiet outline, no picture.
class ZenAllCard extends StatelessWidget {
  const ZenAllCard({super.key, required this.label, required this.height, required this.onTap});
  final String label;
  final double height;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        child: SizedBox(
          height: height,
          child: Material(
            color: Colors.transparent,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: Color(0xFFCFD6C8), width: 1.2)),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, height: 1.25, fontWeight: FontWeight.w700, color: kInk)),
                  const Align(alignment: Alignment.bottomRight, child: Icon(Icons.arrow_forward, color: kAccent)),
                ]),
              ),
            ),
          ),
        ),
      );
}
