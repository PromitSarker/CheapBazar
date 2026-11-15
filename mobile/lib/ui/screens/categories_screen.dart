import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/catalog.dart';
import '../../state/l10n.dart';
import '../category_icons.dart';
import '../theme.dart';
import '../widgets/category_tile.dart';
import '../widgets/common.dart';
import '../widgets/product_card.dart' show toBnIf;
import '../widgets/skeleton.dart';
import 'browse_screen.dart';

/// Departments on the left, the selected department's sub-categories on the right.
class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({super.key});
  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> {
  String? _selectedId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<CatalogController>().load();
    });
  }

  void _open({String? categoryId, String? title, bool wholesale = false, bool search = false}) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => BrowseScreen(categoryId: categoryId, title: title, autofocus: search, initialTab: wholesale ? 'wholesale' : 'retail')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final catalog = context.watch<CatalogController>();
    return Scaffold(
      appBar: AppBar(
        title: Text(t.t('categories')),
        actions: [
          TextButton.icon(
            onPressed: () => _open(wholesale: true, title: t.t('wholesale')),
            icon: const Icon(Icons.inventory_2_outlined, size: 18),
            label: Text(t.t('wholesale')),
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: InkWell(
            onTap: () => _open(search: true),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFD4D4D8))),
              child: Row(children: [
                const Icon(Icons.search, color: kMuted),
                const SizedBox(width: 10),
                Expanded(child: Text(t.t('search_hint'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: kMuted))),
              ]),
            ),
          ),
        ),
        Expanded(child: _body(context, t, catalog)),
      ]),
    );
  }

  Widget _body(BuildContext context, LocaleController t, CatalogController catalog) {
    if (!catalog.loaded && catalog.error != null) return ErrorRetry(message: catalog.error!, onRetry: () => catalog.load(force: true));
    if (!catalog.loaded) return const _CategoriesSkeleton();
    final cats = catalog.categories;
    if (cats.isEmpty) return EmptyState(icon: Icons.category_outlined, title: t.t('no_products_here'), subtitle: t.t('no_products_here_hint'));
    final sel = cats.firstWhere((c) => c.id == _selectedId, orElse: () => cats.first);
    final bn = t.isBn;

    return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        width: 96,
        color: const Color(0xFFF1F1F3),
        child: ListView.builder(
          itemCount: cats.length,
          itemBuilder: (_, i) {
            final c = cats[i];
            final on = c.id == sel.id;
            return Semantics(
              button: true,
              selected: on,
              label: c.name(bn),
              child: InkWell(
                onTap: () => setState(() => _selectedId = c.id),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
                  decoration: BoxDecoration(
                    color: on ? Colors.white : Colors.transparent,
                    border: Border(left: BorderSide(color: on ? kAction : Colors.transparent, width: 3)),
                  ),
                  child: Column(children: [
                    Icon(categoryIcon(c.icon), size: 24, color: on ? kAction : const Color(0xFF52525B)),
                    const SizedBox(height: 4),
                    Text(c.name(bn), maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, height: 1.2, fontWeight: on ? FontWeight.w800 : FontWeight.w600)),
                  ]),
                ),
              ),
            );
          },
        ),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 24), children: [
          Row(children: [
            Expanded(child: Text(sel.name(bn), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
            TextButton(onPressed: () => _open(categoryId: sel.id, title: sel.name(bn)), child: Text(t.t('view_all'))),
          ]),
          if (sel.children.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 24),
              child: EmptyState(
                icon: categoryIcon(sel.icon),
                title: sel.count > 0 ? t.t('products_count', {'n': toBnIf(bn, '${sel.count}')}) : t.t('no_products_here'),
                subtitle: sel.count > 0 ? null : t.t('no_products_here_hint'),
                action: sel.count > 0 ? FilledButton(onPressed: () => _open(categoryId: sel.id, title: sel.name(bn)), child: Text(t.t('view_all'))) : null,
              ),
            )
          else
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 0.78,
              children: [
                for (final s in sel.children) CategoryTile.of(context, s, dimEmpty: true, onTap: () => _open(categoryId: s.id, title: s.name(bn))),
              ],
            ),
        ]),
      ),
    ]);
  }
}

class _CategoriesSkeleton extends StatelessWidget {
  const _CategoriesSkeleton();
  @override
  Widget build(BuildContext context) => Row(children: [
        Container(
          width: 96,
          color: const Color(0xFFF1F1F3),
          padding: const EdgeInsets.all(10),
          child: Column(children: [for (var i = 0; i < 7; i++) const Padding(padding: EdgeInsets.only(bottom: 14), child: Skeleton(height: 54, radius: 10))]),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: GridView.count(
              crossAxisCount: 3,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 0.9,
              children: [for (var i = 0; i < 9; i++) const Center(child: Skeleton(width: 58, height: 58, radius: 29))],
            ),
          ),
        ),
      ]);
}
