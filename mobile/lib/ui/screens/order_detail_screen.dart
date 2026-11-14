import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/l10n.dart';
import '../widgets/common.dart';

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.order, this.lookupPhone});
  final Order order;

  /// For guest orders: the phone used to re-fetch the order.
  final String? lookupPhone;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  late Order order = widget.order;
  bool _busy = false;

  static const _steps = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

  @override
  void initState() {
    super.initState();
    // the list view carries no delivery address: fetch the full order once
    if (order.shippingAddress.isEmpty) WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  Future<void> _refresh() async {
    try {
      final r = (await context.read<ApiClient>().get('/orders/lookup', query: {
        'orderNumber': order.orderNumber,
        'phone': widget.lookupPhone ?? order.buyerPhone,
      })) as Map<String, dynamic>;
      if (mounted) setState(() => order = Order.fromJson((r['order'] as Map).cast<String, dynamic>()));
    } catch (_) {}
  }

  Future<void> _cancel() async {
    final t = context.read<LocaleController>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        content: Text(t.t('cancel_confirm')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t.t('keep_order'))),
          TextButton(onPressed: () => Navigator.pop(context, true), child: Text(t.t('cancel_order'), style: const TextStyle(color: Color(0xFFDC2626)))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<ApiClient>().post('/my/orders/${Uri.encodeComponent(order.id)}/cancel');
      if (mounted) showSnack(context, t.t('order_cancelled'));
      await _refresh();
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final o = order;
    final stepIndex = _steps.indexOf(o.status);
    final terminalBad = o.status == 'CANCELLED' || o.status == 'REFUSED';
    return Scaffold(
      appBar: AppBar(title: Text(o.orderNumber)),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Row(children: [
            Expanded(child: Text(o.storeName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            StatusChip(o.status),
          ]),
          if (o.createdAt != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(_fmt(o.createdAt!), style: const TextStyle(color: Color(0xFF71717A)))),
          const SizedBox(height: 14),
          if (!terminalBad && stepIndex >= 0)
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
                child: Row(children: [
                  for (var i = 0; i < _steps.length; i++) ...[
                    Expanded(
                      child: Column(children: [
                        Icon(i <= stepIndex ? Icons.check_circle : Icons.radio_button_unchecked, color: i <= stepIndex ? const Color(0xFF16A34A) : const Color(0xFFA1A1AA)),
                        const SizedBox(height: 4),
                        Text(t.t('status_${_steps[i]}'), textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: i == stepIndex ? FontWeight.w800 : FontWeight.w500)),
                      ]),
                    ),
                  ],
                ]),
              ),
            ),
          if (o.trackingNumber != null || o.courierName != null) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (o.courierName != null) Text('${t.t('courier')}: ${o.courierName}'),
                  if (o.trackingNumber != null) SelectableText('${t.t('tracking')}: ${o.trackingNumber}'),
                ]),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t.t('items'), style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                for (final i in o.items)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(children: [
                      Expanded(child: Text('${i.quantity} × ${i.name}')),
                      Money(i.lineTotal),
                    ]),
                  ),
                const Divider(height: 20),
                Row(children: [
                  Text(t.t('total'), style: const TextStyle(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Money(o.totalAmount, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                ]),
              ]),
            ),
          ),
          if (o.shippingAddress.isNotEmpty) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(t.t('delivery_to'), style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  Text('${o.buyerName}\n${o.buyerPhone}\n${o.shippingAddress}, ${o.shippingCity}'),
                ]),
              ),
            ),
          ],
          if (o.canCancel) ...[
            const SizedBox(height: 18),
            OutlinedButton(
              onPressed: _busy ? null : _cancel,
              style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
              child: Text(t.t('cancel_order')),
            ),
          ],
        ]),
      ),
    );
  }

  String _fmt(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)}/${d.year}  ${two(d.hour)}:${two(d.minute)}';
  }
}
