import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/catalog.dart';
import '../../state/l10n.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/skeleton.dart';
import '../widgets/zen_category_card.dart';
import 'browse_screen.dart';

void _openListing(BuildContext context, {String? categoryId, String? title, bool wholesale = false, bool search = false}) {
  Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => BrowseScreen(categoryId: categoryId, title: title, autofocus: search, initialTab: wholesale ? 'wholesale' : 'retail')),
  );
}

/// A department with sub-categories opens a second grid; a leaf category opens its listing.
void openCategory(BuildContext context, ShopCategory c) {
  final bn = context.read<LocaleController>().isBn;
  if (c.children.isEmpty) {
    _openListing(context, categoryId: c.id, title: c.name(bn));
  } else {
    Navigator.push(context, MaterialPageRoute(builder: (_) => SubCategoriesScreen(parent: c)));
  }
}

/// Categories tab: the departments as a calm two-column grid of soft cards.
class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({super.key});
  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<CatalogController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final catalog = context.watch<CatalogController>();
    return Scaffold(
      backgroundColor: kWarmWhite,
      appBar: AppBar(
        title: Text(t.t('categories')),
        actions: [
          TextButton.icon(
            onPressed: () => _openListing(context, wholesale: true, title: t.t('wholesale')),
            icon: const Icon(Icons.inventory_2_outlined, size: 18),
            label: Text(t.t('wholesale')),
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
          child: InkWell(
            onTap: () => _openListing(context, search: true),
            borderRadius: BorderRadius.circular(14),
            child: Container(
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFDDE3D6))),
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
    if (!catalog.loaded) return const ZenCategoriesSkeleton();
    final cats = catalog.categories;
    if (cats.isEmpty) return EmptyState(icon: Icons.category_outlined, title: t.t('no_products_here'), subtitle: t.t('no_products_here_hint'));
    return SingleChildScrollView(child: ZenCategoryGrid(items: cats, onOpen: (c) => openCategory(context, c)));
  }
}

/// Second level: the department's sub-categories in the same grid, with an "All" card first.
class SubCategoriesScreen extends StatelessWidget {
  const SubCategoriesScreen({super.key, required this.parent});
  final ShopCategory parent;

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final bn = t.isBn;
    return Scaffold(
      backgroundColor: kWarmWhite,
      appBar: AppBar(title: Text(parent.name(bn))),
      body: SingleChildScrollView(
        child: ZenCategoryGrid(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          items: parent.children,
          leading: (h) => ZenAllCard(label: '${t.t('view_all')} · ${parent.name(bn)}', height: h, onTap: () => _openListing(context, categoryId: parent.id, title: parent.name(bn))),
          onOpen: (c) => openCategory(context, c),
        ),
      ),
    );
  }
}

class ZenCategoriesSkeleton extends StatelessWidget {
  const ZenCategoriesSkeleton({super.key});
  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, box) {
        final w = (box.maxWidth - 32 - ZenCategoryGrid.gap) / 2;
        Widget card(double r) => Padding(padding: const EdgeInsets.only(bottom: ZenCategoryGrid.gap), child: Skeleton(height: w * r, radius: 20));
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(children: [card(ZenCategoryGrid.tallRatio), card(ZenCategoryGrid.shortRatio), card(ZenCategoryGrid.tallRatio)])),
            const SizedBox(width: ZenCategoryGrid.gap),
            Expanded(child: Column(children: [card(ZenCategoryGrid.shortRatio), card(ZenCategoryGrid.tallRatio), card(ZenCategoryGrid.shortRatio)])),
          ]),
        );
      });
}
