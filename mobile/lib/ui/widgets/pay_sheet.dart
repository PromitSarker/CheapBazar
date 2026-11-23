import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../models/pay_info.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../icons.dart';
import '../theme.dart';
import 'common.dart';

/// The seller's payment details for [storeSlug], or null when signed out, the shop has none, or the call fails.
/// Quiet on purpose: a failure here must never get in the way of checking out with cash on delivery.
Future<PayInfo?> fetchPayInfo(BuildContext context, String storeSlug) async {
  if (context.read<SessionController>().user == null) return null;
  try {
    final r = await context.read<ApiClient>().get('/stores/${Uri.encodeComponent(storeSlug)}/pay') as Map<String, dynamic>;
    final info = PayInfo.fromJson(r);
    return info.available ? info : null;
  } catch (_) {
    return null;
  }
}

/// The pop-up: seller numbers (with Copy) and the Bangla QR. The buyer pays on their own; the app records nothing.
Future<void> showPaySheet(BuildContext context, {required PayInfo info, required double amount, String? orderNumber}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    backgroundColor: kWarmWhite,
    builder: (_) => _PaySheet(info: info, amount: amount, orderNumber: orderNumber),
  );
}

String _spaced(String n) => n.length == 11 ? '${n.substring(0, 5)} ${n.substring(5)}' : n;

class _PaySheet extends StatelessWidget {
  const _PaySheet({required this.info, required this.amount, this.orderNumber});
  final PayInfo info;
  final double amount;
  final String? orderNumber;

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final api = context.read<ApiClient>();
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(t.t('pay_sheet_title'), style: serif(24)),
        if (info.storeName.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(info.storeName, style: const TextStyle(color: kMuted))),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: kSurface, borderRadius: BorderRadius.circular(kRadius)),
          child: Row(children: [
            Expanded(child: Text(t.t('pay_amount'), style: const TextStyle(color: kMuted))),
            Money(amount, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: kInk)),
          ]),
        ),
        if (info.numbers.isNotEmpty) ...[
          const SizedBox(height: 18),
          Text(t.t('pay_send_to_number'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
          const SizedBox(height: 8),
          for (final e in info.numbers)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
              decoration: BoxDecoration(color: kSurface, borderRadius: BorderRadius.circular(kRadius)),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(e.key, style: const TextStyle(color: kMuted, fontWeight: FontWeight.w600)),
                    SelectableText(_spaced(e.value), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, letterSpacing: 1, color: kInk)),
                  ]),
                ),
                FilledButton.tonal(
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: e.value));
                    if (context.mounted) showSnack(context, t.t('pay_copied', {'name': e.key}));
                  },
                  child: Text(t.t('pay_copy')),
                ),
              ]),
            ),
        ],
        if (info.hasQr) ...[
          const SizedBox(height: 14),
          Text(t.t('pay_scan_qr'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
          const SizedBox(height: 8),
          Center(
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(kRadius)),
              child: Image.network(
                api.absoluteUrl(info.banglaQrUrl),
                width: 260,
                height: 260,
                fit: BoxFit.contain,
                loadingBuilder: (c, child, p) => p == null ? child : const SizedBox(width: 260, height: 260, child: Center(child: CircularProgressIndicator(strokeWidth: 2.4))),
                errorBuilder: (c, e, s) => SizedBox(width: 260, height: 120, child: Center(child: Text(t.t('pay_qr_failed'), textAlign: TextAlign.center, style: const TextStyle(color: kMuted)))),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: kSoftMint, borderRadius: BorderRadius.circular(kRadius)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Zi.info, color: kAccent),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                orderNumber != null ? t.t('pay_reference_tip', {'order': orderNumber!}) : t.t('pay_reference_tip_pre'),
                style: const TextStyle(color: kInk, height: 1.4),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        Text(t.t('pay_disclaimer'), style: const TextStyle(color: kMuted, fontSize: 13, height: 1.4)),
        const SizedBox(height: 16),
        SizedBox(width: double.infinity, child: OutlinedButton(onPressed: () => Navigator.pop(context), child: Text(t.t('pay_close')))),
      ]),
    );
  }
}

/// "Pay now" button for an order. Shows nothing unless the order is an open retail order, the buyer is signed in and the
/// seller has set up direct payment. With [autoOpen] the pop-up opens by itself once (right after placing the order).
class PayNowButton extends StatefulWidget {
  const PayNowButton({super.key, required this.order, this.autoOpen = false});
  final Order order;
  final bool autoOpen;

  @override
  State<PayNowButton> createState() => _PayNowButtonState();
}

class _PayNowButtonState extends State<PayNowButton> {
  PayInfo? _info;

  bool get _eligible => canPayDirectly(orderType: widget.order.orderType, status: widget.order.status);

  @override
  void initState() {
    super.initState();
    if (_eligible) WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final info = await fetchPayInfo(context, widget.order.storeSlug);
    if (!mounted) return;
    setState(() => _info = info);
    if (info != null && widget.autoOpen) _open();
  }

  void _open() {
    final info = _info;
    if (info == null) return;
    showPaySheet(context, info: info, amount: widget.order.totalAmount, orderNumber: widget.order.orderNumber);
  }

  @override
  Widget build(BuildContext context) {
    if (!_eligible || _info == null) return const SizedBox.shrink();
    final t = context.watch<LocaleController>();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FilledButton.icon(onPressed: _open, icon: const Icon(Zi.payments), label: Text(t.t('pay_now'))),
    );
  }
}
