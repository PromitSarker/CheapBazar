import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import 'auth_screen.dart';
import 'order_detail_screen.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  Future<List<Order>>? _future;
  bool? _wasLoggedIn;

  Future<List<Order>> _load() async {
    final r = (await context.read<ApiClient>().get('/my/orders')) as Map<String, dynamic>;
    return ((r['orders'] as List?) ?? const []).map((e) => Order.fromJson((e as Map).cast<String, dynamic>())).toList();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final session = context.watch<SessionController>();
    if (session.loggedIn != _wasLoggedIn) {
      _wasLoggedIn = session.loggedIn;
      _future = session.loggedIn ? _load() : null;
    }
    return Scaffold(
      appBar: AppBar(title: Text(t.t('my_orders'))),
      body: session.loggedIn ? _list(t) : _guest(t),
    );
  }

  Widget _list(LocaleController t) {
    return RefreshIndicator(
      onRefresh: () async {
        setState(() => _future = _load());
        await _future!.catchError((_) => <Order>[]);
      },
      child: FutureBuilder<List<Order>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) {
            return ListView(children: [SizedBox(height: 420, child: ErrorRetry(message: errorText(snap.error!), onRetry: () => setState(() => _future = _load())))]);
          }
          final orders = snap.data!;
          if (orders.isEmpty) return ListView(children: [SizedBox(height: 420, child: EmptyState(icon: Icons.receipt_long_outlined, title: t.t('no_orders')))]);
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: orders.length + 1,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              if (i == orders.length) return TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TrackOrderScreen())), child: Text(t.t('track_order')));
              final o = orders[i];
              return Card(
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () async {
                    await Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(order: o)));
                    if (mounted) setState(() => _future = _load());
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(o.storeName, style: const TextStyle(fontWeight: FontWeight.w800))),
                        StatusChip(o.status),
                      ]),
                      const SizedBox(height: 4),
                      Text(o.orderNumber, style: const TextStyle(color: Color(0xFF5C6B64), fontSize: 12)),
                      const SizedBox(height: 6),
                      Text(o.items.map((i) => '${i.quantity}× ${i.name}').join(', '), maxLines: 2, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 8),
                      Row(children: [Money(o.totalAmount, style: const TextStyle(fontWeight: FontWeight.w800)), const Spacer(), const Icon(Icons.chevron_right, color: Color(0xFF8A9A92))]),
                    ]),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _guest(LocaleController t) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      EmptyState(
        icon: Icons.receipt_long_outlined,
        title: t.t('login_to_see_orders'),
        action: SizedBox(width: 200, child: FilledButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AuthScreen())), child: Text(t.t('login')))),
      ),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TrackOrderScreen())),
        icon: const Icon(Icons.local_shipping_outlined),
        label: Text(t.t('track_order')),
      ),
    ]);
  }
}

class TrackOrderScreen extends StatefulWidget {
  const TrackOrderScreen({super.key});
  @override
  State<TrackOrderScreen> createState() => _TrackOrderScreenState();
}

class _TrackOrderScreenState extends State<TrackOrderScreen> {
  final _number = TextEditingController();
  final _phone = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _number.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _go() async {
    if (_number.text.trim().isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final r = (await context.read<ApiClient>().get('/orders/lookup', query: {'orderNumber': _number.text.trim(), 'phone': _phone.text.trim()})) as Map<String, dynamic>;
      final order = Order.fromJson((r['order'] as Map).cast<String, dynamic>());
      if (!mounted) return;
      Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order, lookupPhone: _phone.text.trim())));
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    return Scaffold(
      appBar: AppBar(title: Text(t.t('track_order'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(t.t('track_hint'), style: const TextStyle(color: Color(0xFF4F6159))),
        const SizedBox(height: 14),
        TextField(controller: _number, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: t.t('order_number'), hintText: 'ORD-XXXXXXXX')),
        const SizedBox(height: 12),
        TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: t.t('phone'))),
        const SizedBox(height: 18),
        FilledButton(onPressed: _busy ? null : _go, child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : Text(t.t('track'))),
      ]),
    );
  }
}
