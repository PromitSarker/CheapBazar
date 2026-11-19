import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:provider/provider.dart';

import '../../state/ads.dart';
import '../theme.dart';

/// One quiet Google ad slot. Takes no space until an ad has actually loaded, so a disabled
/// config, no fill or an offline phone leave no hole in the page.
class NetworkAd extends StatefulWidget {
  const NetworkAd({super.key, required this.placement});

  /// 'home' | 'browse' | 'product'
  final String placement;

  @override
  State<NetworkAd> createState() => _NetworkAdState();
}

class _NetworkAdState extends State<NetworkAd> {
  BannerAd? _ad;
  double _height = 0;
  bool _requested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_requested) return;
    final unit = context.watch<AdsController>().unit(widget.placement);
    if (unit == null) return;
    _requested = true;
    final width = (MediaQuery.of(context).size.width - 32).truncate();
    late final BannerAd ad;
    ad = BannerAd(
      adUnitId: unit,
      size: AdSize.getCurrentOrientationInlineAdaptiveBannerAdSize(width),
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (_) async {
          final size = await ad.getPlatformAdSize();
          if (!mounted) return;
          setState(() {
            _ad = ad;
            _height = (size?.height ?? 100).toDouble();
          });
        },
        onAdFailedToLoad: (a, _) => a.dispose(),
      ),
    );
    ad.load();
    _pending = ad;
  }

  BannerAd? _pending;

  @override
  void dispose() {
    (_ad ?? _pending)?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ad = _ad;
    if (ad == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 4),
          child: Text('Ad', style: TextStyle(fontSize: 11, color: kMuted, letterSpacing: 0.6)),
        ),
        SizedBox(height: _height, child: AdWidget(ad: ad)),
      ]),
    );
  }
}
