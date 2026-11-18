import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/l10n.dart';
import '../category_icons.dart';
import '../theme.dart';

/// Round icon + label, as in the home grid and the sub-category grid.
class CategoryTile extends StatelessWidget {
  const CategoryTile({super.key, required this.label, required this.icon, required this.onTap, this.dim = false});
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool dim;

  factory CategoryTile.of(BuildContext context, ShopCategory c, {required VoidCallback onTap, bool dimEmpty = false}) {
    final bn = context.read<LocaleController>().isBn;
    return CategoryTile(label: c.name(bn), icon: categoryIcon(c.icon), onTap: onTap, dim: dimEmpty && c.count == 0);
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 58,
              height: 58,
              decoration: const BoxDecoration(color: kActionSoft, shape: BoxShape.circle),
              child: Icon(icon, color: dim ? const Color(0xFF9CA3AF) : kAction, size: 26),
            ),
            const SizedBox(height: 6),
            Text(
              label,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, height: 1.2, fontWeight: FontWeight.w600, color: dim ? kMuted : const Color(0xFF24332D)),
            ),
          ]),
        ),
      ),
    );
  }
}
