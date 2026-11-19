import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/l10n.dart';
import '../../state/location.dart';
import '../theme.dart';

String _failText(LocaleController t, LocationException e) => switch (e.code) {
      'disabled' => t.t('loc_gps_off'),
      'denied' => t.t('loc_denied'),
      'denied_forever' => t.t('loc_denied_forever'),
      _ => t.t('loc_failed'),
    };

/// "Where are you?": GPS in one tap, or a district from the list when GPS is off or refused.
Future<void> showLocationSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    builder: (_) => const _LocationSheet(),
  );
}

class _LocationSheet extends StatefulWidget {
  const _LocationSheet();
  @override
  State<_LocationSheet> createState() => _LocationSheetState();
}

class _LocationSheetState extends State<_LocationSheet> {
  final _filter = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _filter.dispose();
    super.dispose();
  }

  Future<void> _gps() async {
    final loc = context.read<LocationController>();
    final t = context.read<LocaleController>();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await loc.useGps();
      if (mounted) Navigator.pop(context);
    } on LocationException catch (e) {
      if (mounted) setState(() => _error = _failText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final loc = context.watch<LocationController>();
    final q = _filter.text.trim().toLowerCase();
    final list = loc.districts.where((d) => q.isEmpty || d.nameEn.toLowerCase().contains(q) || d.nameBn.contains(q)).toList();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.78,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
            child: Text(t.t('loc_title'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Text(
              loc.enabled && loc.radiusKm != null ? t.t('loc_hint_range', {'km': _km(loc.radiusKm!)}) : t.t('loc_hint_near'),
              style: const TextStyle(color: kMuted, height: 1.35),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _busy ? null : _gps,
                icon: _busy
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.my_location),
                label: Text(_busy ? t.t('loc_finding') : t.t('loc_use_gps')),
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
              child: Text(_error!, style: const TextStyle(color: Color(0xFFDC2626), height: 1.3)),
            ),
          const Padding(padding: EdgeInsets.fromLTRB(20, 16, 20, 6), child: Divider(height: 1)),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
            child: TextField(
              controller: _filter,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: t.t('loc_search_district'), isDense: true),
            ),
          ),
          Expanded(
            child: loc.districts.isEmpty
                ? Center(child: Text(t.t('loc_districts_unavailable'), style: const TextStyle(color: kMuted)))
                : ListView.builder(
                    itemCount: list.length,
                    itemBuilder: (_, i) {
                      final d = list[i];
                      final selected = loc.label == d.id;
                      return ListTile(
                        title: Text(d.name(t.isBn)),
                        trailing: selected ? const Icon(Icons.check, color: Color(0xFF123B32)) : null,
                        onTap: () async {
                          await loc.chooseDistrict(d);
                          if (context.mounted) Navigator.pop(context);
                        },
                      );
                    },
                  ),
          ),
          if (loc.hasLocation)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: TextButton(
                onPressed: () async {
                  await loc.clear();
                  if (context.mounted) Navigator.pop(context);
                },
                child: Text(t.t('loc_forget')),
              ),
            ),
        ]),
      ),
    );
  }
}

String _km(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

/// Small "pin + place" button for app bars. Hidden while the admin's range limit is off.
class LocationChip extends StatelessWidget {
  const LocationChip({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final loc = context.watch<LocationController>();
    if (!loc.enabled) return const SizedBox.shrink();
    final label = loc.shortLabel(t.isBn, nearMe: t.t('loc_near_me'), notSet: t.t('loc_set'));
    return TextButton.icon(
      onPressed: () => showLocationSheet(context),
      icon: const Icon(Icons.place_outlined, size: 18),
      label: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 110),
        child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      style: TextButton.styleFrom(foregroundColor: loc.hasLocation ? const Color(0xFF123B32) : const Color(0xFFB45309)),
    );
  }
}

/// Slim "pin + place + range" row shown at the top of Home while the admin limits shops by distance.
class LocationBar extends StatelessWidget {
  const LocationBar({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final loc = context.watch<LocationController>();
    if (!loc.enabled) return const SizedBox.shrink();
    final label = loc.shortLabel(t.isBn, nearMe: t.t('loc_near_me'), notSet: t.t('loc_set'));
    return InkWell(
      onTap: () => showLocationSheet(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 12, 4),
        child: Row(children: [
          const Icon(Icons.place_outlined, size: 18),
          const SizedBox(width: 6),
          Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
          if (loc.radiusKm != null)
            Text('  ·  ${t.t('loc_within', {'km': _km(loc.radiusKm!)})}', style: const TextStyle(color: kMuted, fontSize: 13)),
          const Spacer(),
          const Icon(Icons.keyboard_arrow_down, color: kMuted),
        ]),
      ),
    );
  }
}

/// Full-screen empty state: the admin limits shops by distance and the buyer has not said where they are (or the shop is out of range).
class LocationPrompt extends StatelessWidget {
  const LocationPrompt({super.key, this.message, this.radiusKm});
  final String? message;
  final double? radiusKm;

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final r = radiusKm ?? context.watch<LocationController>().radiusKm;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.place_outlined, size: 56, color: kMuted),
          const SizedBox(height: 14),
          Text(t.t('loc_prompt_title'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(
            message ?? (r != null ? t.t('loc_prompt_range', {'km': _km(r)}) : t.t('loc_prompt_plain')),
            textAlign: TextAlign.center,
            style: const TextStyle(color: kMuted, height: 1.4),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(onPressed: () => showLocationSheet(context), icon: const Icon(Icons.my_location), label: Text(t.t('loc_set_btn'))),
        ]),
      ),
    );
  }
}
