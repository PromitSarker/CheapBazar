import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import 'auth_screen.dart';

class ProScreen extends StatefulWidget {
  const ProScreen({super.key});
  @override
  State<ProScreen> createState() => _ProScreenState();
}

class _ProScreenState extends State<ProScreen> {
  Future<Map<String, dynamic>>? _future;
  final _trx = TextEditingController();
  String _method = 'BKASH';
  bool _busy = false;

  Future<Map<String, dynamic>> _load() async => (await context.read<ApiClient>().get('/pro')) as Map<String, dynamic>;

  @override
  void initState() {
    super.initState();
    if (context.read<SessionController>().loggedIn) _future = _load();
  }

  @override
  void dispose() {
    _trx.dispose();
    super.dispose();
  }

  Future<void> _submit(LocaleController t) async {
    if (_trx.text.trim().length < 4 || _busy) return;
    setState(() => _busy = true);
    try {
      await context.read<ApiClient>().post('/pro/pay', {'method': _method, 'trxId': _trx.text.trim()});
      _trx.clear();
      if (mounted) {
        showSnack(context, t.t('payment_submitted'));
        setState(() => _future = _load());
      }
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final session = context.watch<SessionController>();
    if (!session.loggedIn) {
      return Scaffold(
        appBar: AppBar(title: Text(t.t('buyer_pro'))),
        body: EmptyState(
          icon: Icons.workspace_premium_outlined,
          title: t.t('buyer_pro'),
          subtitle: t.t('buyer_pro_blurb'),
          action: SizedBox(
            width: 200,
            child: FilledButton(
              onPressed: () async {
                final ok = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const AuthScreen()));
                if (ok == true && mounted) setState(() => _future = _load());
              },
              child: Text(t.t('login')),
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(t.t('buyer_pro'))),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) return ErrorRetry(message: errorText(snap.error!), onRetry: () => setState(() => _future = _load()));
          final d = snap.data!;
          final plan = d['plan'] == null ? null : ProPlan.fromJson((d['plan'] as Map).cast<String, dynamic>());
          final status = ProStatus.fromJson((d['status'] as Map).cast<String, dynamic>());
          final payments = ((d['payments'] as List?) ?? const []).map((e) => ProPayment.fromJson((e as Map).cast<String, dynamic>())).toList();
          final instructions = '${d['instructions'] ?? ''}'.trim();
          return ListView(padding: const EdgeInsets.all(16), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Icon(Icons.workspace_premium, size: 30, color: Color(0xFFD97706)),
                    const SizedBox(width: 10),
                    Expanded(child: Text(t.t('buyer_pro'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
                  ]),
                  const SizedBox(height: 6),
                  Text(t.t('buyer_pro_blurb'), style: const TextStyle(color: Color(0xFF4F6159))),
                  const SizedBox(height: 10),
                  Text(
                    status.active
                        ? t.t('pro_active', {'d': status.currentPeriodEnd == null ? '' : '${status.currentPeriodEnd!.day}/${status.currentPeriodEnd!.month}/${status.currentPeriodEnd!.year}'})
                        : t.t('pro_inactive'),
                    style: TextStyle(fontWeight: FontWeight.w700, color: status.active ? const Color(0xFF1E7A57) : const Color(0xFF5C6B64)),
                  ),
                  if (plan != null) ...[
                    const SizedBox(height: 6),
                    Text(t.t('pro_price', {'p': formatMoney(plan.price, bn: t.isBn), 'n': '${plan.periodDays}'}), style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ]),
              ),
            ),
            const SizedBox(height: 16),
            Text(t.t('pro_how'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(t.t('pro_instructions'), style: const TextStyle(color: Color(0xFF4F6159), height: 1.4)),
            if (instructions.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFDE68A))),
                child: SelectableText(instructions, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            ],
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _method,
              decoration: InputDecoration(labelText: t.t('pay_method')),
              items: const [
                DropdownMenuItem(value: 'BKASH', child: Text('bKash')),
                DropdownMenuItem(value: 'NAGAD', child: Text('Nagad')),
                DropdownMenuItem(value: 'ROCKET', child: Text('Rocket')),
                DropdownMenuItem(value: 'BANK', child: Text('Bank transfer')),
              ],
              onChanged: (v) => setState(() => _method = v ?? 'BKASH'),
            ),
            const SizedBox(height: 12),
            TextField(controller: _trx, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: t.t('trx_id'))),
            const SizedBox(height: 14),
            FilledButton(onPressed: _busy ? null : () => _submit(t), child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)) : Text(t.t('submit_payment'))),
            if (payments.isNotEmpty) ...[
              const SizedBox(height: 22),
              Text(t.t('recent_payments'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              for (final p in payments)
                Card(
                  child: ListTile(
                    title: Text('${p.method} · ${p.trxId}'),
                    subtitle: Text(p.status),
                    trailing: Money(p.amount),
                  ),
                ),
            ],
          ]);
        },
      ),
    );
  }
}
