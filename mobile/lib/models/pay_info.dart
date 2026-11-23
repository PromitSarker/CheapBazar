/// How a buyer can pay a seller directly (outside the app): up to three mobile-wallet numbers and a Bangla QR.
/// The app only displays this; nothing about the payment itself is recorded anywhere.
class PayInfo {
  PayInfo({required this.storeName, this.bkash, this.nagad, this.rocket, this.banglaQrUrl});

  final String storeName;
  final String? bkash;
  final String? nagad;
  final String? rocket;
  final String? banglaQrUrl;

  factory PayInfo.fromJson(Map<String, dynamic> j) {
    String? s(dynamic v) {
      final x = (v ?? '').toString().trim();
      return x.isEmpty ? null : x;
    }

    final store = j['store'] is Map ? (j['store'] as Map) : const {};
    return PayInfo(
      storeName: (store['name'] ?? '').toString(),
      bkash: s(j['bkash']),
      nagad: s(j['nagad']),
      rocket: s(j['rocket']),
      banglaQrUrl: s(j['banglaQrUrl']),
    );
  }

  /// Provider name -> number, in a fixed order, only the ones the seller has set.
  List<MapEntry<String, String>> get numbers => [
        if (bkash != null) MapEntry('bKash', bkash!),
        if (nagad != null) MapEntry('Nagad', nagad!),
        if (rocket != null) MapEntry('Rocket', rocket!),
      ];

  bool get hasQr => banglaQrUrl != null;
  bool get available => numbers.isNotEmpty || hasQr;
}

/// Only retail orders that are still open can be paid for directly.
bool canPayDirectly({required String orderType, required String status}) =>
    orderType == 'RETAIL' && const {'PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED'}.contains(status);
