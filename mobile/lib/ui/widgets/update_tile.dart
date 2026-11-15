import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/api_client.dart';
import '../../state/app_update.dart';
import '../../state/l10n.dart';
import 'common.dart';

/// Settings row: "Check for updates". When a newer APK is published on the site it offers to download it;
/// Android then asks the user to tap Install (same signing key, so it updates in place and keeps their data).
class UpdateTile extends StatefulWidget {
  const UpdateTile({super.key, this.client});
  final http.Client? client; // injectable for tests

  @override
  State<UpdateTile> createState() => _UpdateTileState();
}

class _UpdateTileState extends State<UpdateTile> {
  bool _busy = false;

  Future<void> _check() async {
    final t = context.read<LocaleController>();
    final base = context.read<ApiClient>().baseUrl;
    setState(() => _busy = true);
    AppUpdate? update;
    try {
      update = await checkForUpdate(widget.client ?? http.Client(), base);
    } catch (_) {
      if (mounted) {
        setState(() => _busy = false);
        showSnack(context, t.t('update_check_failed'), error: true);
      }
      return;
    }
    if (!mounted) return;
    setState(() => _busy = false);
    if (update == null) {
      showSnack(context, t.t('up_to_date'));
      return;
    }
    final mb = update.size > 0 ? ' (${(update.size / 1024 / 1024).toStringAsFixed(1)} MB)' : '';
    final go = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(t.t('update_available')),
        content: Text('${t.t('update_available_body', {'v': update!.version})}$mb'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t.t('later'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(t.t('update_now'))),
        ],
      ),
    );
    if (go != true || !mounted) return;
    final ok = await launchUrl(update.downloadUri(base), mode: LaunchMode.externalApplication);
    if (!ok && mounted) showSnack(context, t.t('update_check_failed'), error: true);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    return ListTile(
      leading: const Icon(Icons.system_update_alt),
      title: Text(t.t('check_update')),
      trailing: _busy
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.chevron_right),
      onTap: _busy ? null : _check,
    );
  }
}
