import 'dart:math';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import 'order_detail_screen.dart';

String _newKey() {
  final r = Random.secure();
  return List.generate(24, (_) => r.nextInt(16).toRadixString(16)).join();
}

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key, required this.group});
  final CartGroup group;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController(text: 'Dhaka');
  final String _idempotencyKey = _newKey(); // one key per checkout attempt: a double tap never orders twice
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<SessionController>().user;
    if (user != null) {
      _name.text = user.name;
      _email.text = user.email;
    }
    _restore();
  }

  Future<void> _restore() async {
    try {
      final p = await SharedPreferences.getInstance();
      if (_phone.text.isEmpty) _phone.text = p.getString('co_phone') ?? '';
      if (_address.text.isEmpty) _address.text = p.getString('co_address') ?? '';
      final city = p.getString('co_city');
      if (city != null && city.isNotEmpty) _city.text = city;
      if (_name.text.isEmpty) _name.text = p.getString('co_name') ?? '';
      if (mounted) setState(() {});
    } catch (_) {}
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _address, _city]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate() || _busy) return;
    final g = widget.group;
    setState(() => _busy = true);
    try {
      final r = (await context.read<ApiClient>().post(
        '/orders',
        {
          'storeSlug': g.storeSlug,
          'orderType': g.orderType,
          'buyer': {'name': _name.text.trim(), 'phone': _phone.text.trim(), 'email': _email.text.trim()},
          'shipping': {'address': _address.text.trim(), 'city': _city.text.trim().isEmpty ? 'Dhaka' : _city.text.trim()},
          'items': [for (final l in g.lines) {'productId': l.productId, 'quantity': l.quantity}],
        },
        {'idempotency-key': _idempotencyKey},
      )) as Map<String, dynamic>;
      final order = Order.fromJson((r['order'] as Map).cast<String, dynamic>());
      try {
        final p = await SharedPreferences.getInstance();
        await p.setString('co_phone', _phone.text.trim());
        await p.setString('co_address', _address.text.trim());
        await p.setString('co_city', _city.text.trim());
        await p.setString('co_name', _name.text.trim());
      } catch (_) {}
      if (!mounted) return;
      context.read<CartController>().removeGroup(g.storeSlug, g.orderType);
      context.read<SessionController>().refreshUnread();
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => OrderSuccessScreen(order: order)));
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showSnack(context, errorText(e), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final g = widget.group;
    String? required(String? v) => (v == null || v.trim().isEmpty) ? t.t('required_field') : null;
    return Scaffold(
      appBar: AppBar(title: Text(t.t('checkout'))),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(g.storeName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 8),
                for (final l in g.lines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(children: [
                      Expanded(child: Text('${l.quantity} × ${l.name}', maxLines: 1, overflow: TextOverflow.ellipsis)),
                      Money(l.lineTotal),
                    ]),
                  ),
                const Divider(height: 20),
                Row(children: [
                  Text(t.t('total'), style: const TextStyle(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Money(g.total, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                ]),
              ]),
            ),
          ),
          const SizedBox(height: 18),
          Text(t.t('your_details'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          TextFormField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: t.t('full_name')), validator: required, autofillHints: const [AutofillHints.name]),
          const SizedBox(height: 12),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(labelText: t.t('phone'), hintText: '01XXXXXXXXX'),
            autofillHints: const [AutofillHints.telephoneNumber],
            validator: (v) => RegExp(r'^\+?[0-9]{10,15}$').hasMatch((v ?? '').replaceAll(RegExp(r'[\s-]'), '')) ? null : t.t('invalid_phone'),
          ),
          const SizedBox(height: 12),
          TextFormField(controller: _address, minLines: 2, maxLines: 3, decoration: InputDecoration(labelText: t.t('address')), validator: required, autofillHints: const [AutofillHints.fullStreetAddress]),
          const SizedBox(height: 12),
          TextFormField(controller: _city, decoration: InputDecoration(labelText: t.t('city'))),
          const SizedBox(height: 12),
          TextFormField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: t.t('email_optional'))),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFBBF7D0))),
            child: Row(children: [
              const Icon(Icons.payments_outlined, color: Color(0xFF15803D)),
              const SizedBox(width: 10),
              Expanded(child: Text(t.t('cod_note'), style: const TextStyle(color: Color(0xFF166534), fontWeight: FontWeight.w600))),
            ]),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : Text('${t.t('place_order')} · ${formatMoney(g.total, bn: t.isBn)}'),
          ),
        ]),
      ),
    );
  }
}

class OrderSuccessScreen extends StatelessWidget {
  const OrderSuccessScreen({super.key, required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).popUntil((r) => r.isFirst);
      },
      child: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const CircleAvatar(radius: 40, backgroundColor: Color(0xFFDCFCE7), child: Icon(Icons.check_rounded, size: 48, color: Color(0xFF1E7A57))),
              const SizedBox(height: 18),
              Text(t.t('order_placed'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(t.t('order_placed_hint'), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF4F6159), height: 1.4)),
              const SizedBox(height: 22),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(children: [
                    Text(t.t('order_number'), style: const TextStyle(color: Color(0xFF5C6B64))),
                    const SizedBox(height: 2),
                    SelectableText(order.orderNumber, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: 1)),
                    const SizedBox(height: 8),
                    Money(order.totalAmount, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  ]),
                ),
              ),
              const SizedBox(height: 26),
              FilledButton(
                onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order, lookupPhone: order.buyerPhone))),
                child: Text(t.t('view_order')),
              ),
              const SizedBox(height: 10),
              OutlinedButton(onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst), child: Text(t.t('continue_shopping'))),
            ]),
          ),
        ),
      ),
    );
  }
}
