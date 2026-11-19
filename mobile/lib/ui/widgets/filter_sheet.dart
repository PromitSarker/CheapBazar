import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/l10n.dart';
import '../theme.dart';

/// What the shopper narrowed the list down to (everything optional).
class ProductFilters {
  const ProductFilters({this.brand, this.min, this.max, this.inStock = false, this.onSale = false});
  final String? brand;
  final double? min;
  final double? max;
  final bool inStock;
  final bool onSale;

  int get activeCount => (brand != null ? 1 : 0) + (min != null || max != null ? 1 : 0) + (inStock ? 1 : 0) + (onSale ? 1 : 0);

  ProductFilters copyWith({Object? brand = _keep, Object? min = _keep, Object? max = _keep, bool? inStock, bool? onSale}) => ProductFilters(
        brand: identical(brand, _keep) ? this.brand : brand as String?,
        min: identical(min, _keep) ? this.min : min as double?,
        max: identical(max, _keep) ? this.max : max as double?,
        inStock: inStock ?? this.inStock,
        onSale: onSale ?? this.onSale,
      );

  @override
  bool operator ==(Object other) => other is ProductFilters && other.brand == brand && other.min == min && other.max == max && other.inStock == inStock && other.onSale == onSale;
  @override
  int get hashCode => Object.hash(brand, min, max, inStock, onSale);
}

const Object _keep = Object();

/// Brand + price + availability + deals. Returns the new filters, or null when dismissed.
Future<ProductFilters?> showFilterSheet(
  BuildContext context, {
  required ProductFilters current,
  required List<({String brand, int count})> brands,
  required bool allowPrice,
  required bool allowSale,
}) {
  return showModalBottomSheet<ProductFilters>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: Colors.white,
    builder: (_) => _FilterSheet(current: current, brands: brands, allowPrice: allowPrice, allowSale: allowSale),
  );
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.current, required this.brands, required this.allowPrice, required this.allowSale});
  final ProductFilters current;
  final List<({String brand, int count})> brands;
  final bool allowPrice;
  final bool allowSale;
  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late ProductFilters _f = widget.current;
  late final _min = TextEditingController(text: widget.current.min == null ? '' : _fmt(widget.current.min!));
  late final _max = TextEditingController(text: widget.current.max == null ? '' : _fmt(widget.current.max!));

  static String _fmt(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();
  static double? _num(String s) {
    final v = double.tryParse(s.trim().replaceAll(',', ''));
    return (v == null || v < 0) ? null : v;
  }

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  void _apply() {
    var lo = widget.allowPrice ? _num(_min.text) : null;
    var hi = widget.allowPrice ? _num(_max.text) : null;
    if (lo != null && hi != null && lo > hi) {
      final t = lo; // forgiving: swap instead of showing an error for a typo
      lo = hi;
      hi = t;
    }
    Navigator.pop(context, _f.copyWith(min: lo, max: hi));
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 16),
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Expanded(child: Text(t.t('filters'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
              TextButton(
                onPressed: () {
                  _min.clear();
                  _max.clear();
                  setState(() => _f = const ProductFilters());
                },
                child: Text(t.t('reset')),
              ),
            ]),
            if (widget.brands.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(t.t('brand'), style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                ChoiceChip(
                  label: Text(t.t('all')),
                  selected: _f.brand == null,
                  selectedColor: kActionSoft,
                  onSelected: (_) => setState(() => _f = _f.copyWith(brand: null)),
                ),
                for (final b in widget.brands)
                  ChoiceChip(
                    label: Text('${b.brand} (${t.isBn ? toBnDigits('${b.count}') : b.count})'),
                    selected: _f.brand?.toLowerCase() == b.brand.toLowerCase(),
                    selectedColor: kActionSoft,
                    onSelected: (_) => setState(() => _f = _f.copyWith(brand: b.brand)),
                  ),
              ]),
            ],
            if (widget.allowPrice) ...[
              const SizedBox(height: 16),
              Text(t.t('price_range'), style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: TextField(controller: _min, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t.t('price_min'), prefixText: '৳ '))),
                const Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('–')),
                Expanded(child: TextField(controller: _max, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t.t('price_max'), prefixText: '৳ '))),
              ]),
            ],
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(t.t('in_stock_only')),
              value: _f.inStock,
              activeThumbColor: kAction,
              onChanged: (v) => setState(() => _f = _f.copyWith(inStock: v)),
            ),
            if (widget.allowSale)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(t.t('on_sale')),
                value: _f.onSale,
                activeThumbColor: kAction,
                onChanged: (v) => setState(() => _f = _f.copyWith(onSale: v)),
              ),
            const SizedBox(height: 12),
            FilledButton(onPressed: _apply, child: Text(t.t('apply'))),
          ]),
        ),
      ),
    );
  }
}
