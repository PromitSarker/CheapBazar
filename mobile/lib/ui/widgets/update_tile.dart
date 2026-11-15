import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../state/app_update.dart';
import '../../state/l10n.dart';
import '../theme.dart';
import 'common.dart';

/// Account > "Check for updates". When a newer APK is published it downloads it inside the app (with progress
/// and a checksum check) and opens Android's installer. Same signing key, so it updates in place and keeps
/// the shopper's login and bag.
class UpdateTile extends StatefulWidget {
  const UpdateTile({super.key, this.client, this.downloader, this.installer});
  final http.Client? client; // injectable for tests
  final UpdateDownloader? downloader;
  final ApkInstaller? installer;

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
    final found = update;
    final mb = found.size > 0 ? ' (${(found.size / 1024 / 1024).toStringAsFixed(1)} MB)' : '';
    final go = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(t.t('update_available')),
        content: Text('${t.t('update_available_body', {'v': found.version})}$mb'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t.t('later'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(t.t('update_now'))),
        ],
      ),
    );
    if (go != true || !mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => UpdateDialog(
        update: found,
        baseUrl: base,
        downloader: widget.downloader ?? UpdateDownloader(client: widget.client),
        installer: widget.installer ?? installWithAndroid,
      ),
    );
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

enum _Phase { downloading, ready, error }

/// Download progress, then "Install". Stays open after the installer launches so the shopper can tap
/// Install again if Android first sent them off to allow installs from this app.
class UpdateDialog extends StatefulWidget {
  const UpdateDialog({super.key, required this.update, required this.baseUrl, required this.downloader, required this.installer});
  final AppUpdate update;
  final String baseUrl;
  final UpdateDownloader downloader;
  final ApkInstaller installer;

  @override
  State<UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<UpdateDialog> {
  _Phase _phase = _Phase.downloading;
  double? _progress; // null while the total size is unknown
  String? _errorKey;
  File? _file;
  bool _installerBusy = false;
  InstallOutcome? _outcome;
  UpdateCancelToken _cancel = UpdateCancelToken();

  @override
  void initState() {
    super.initState();
    _download();
  }

  Future<void> _download() async {
    _cancel = UpdateCancelToken();
    setState(() {
      _phase = _Phase.downloading;
      _progress = 0;
      _errorKey = null;
    });
    try {
      final f = await widget.downloader.download(
        widget.update,
        widget.baseUrl,
        cancel: _cancel,
        onProgress: (r, total) {
          if (mounted) setState(() => _progress = total > 0 ? (r / total).clamp(0.0, 1.0) : null);
        },
      );
      if (!mounted) return;
      _file = f;
      setState(() => _phase = _Phase.ready);
      await _install();
    } on UpdateCancelled {
      if (mounted) Navigator.pop(context);
    } on UpdateIntegrityError {
      _fail('update_corrupt');
    } catch (_) {
      _fail('update_download_failed');
    }
  }

  void _fail(String key) {
    if (!mounted) return;
    setState(() {
      _phase = _Phase.error;
      _errorKey = key;
    });
  }

  Future<void> _install() async {
    final f = _file;
    if (f == null || _installerBusy) return;
    setState(() {
      _installerBusy = true;
      _outcome = null;
    });
    InstallOutcome o;
    try {
      o = await widget.installer(f);
    } catch (_) {
      o = InstallOutcome.failed;
    }
    if (!mounted) return;
    setState(() {
      _installerBusy = false;
      _outcome = o;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final pct = _progress == null ? '' : ' ${t.isBn ? toBnDigits('${(_progress! * 100).round()}') : (_progress! * 100).round()}%';
    switch (_phase) {
      case _Phase.downloading:
        return PopScope(
          canPop: false,
          child: AlertDialog(
            title: Text(t.t('downloading_update')),
            content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              LinearProgressIndicator(value: _progress, color: kAction, minHeight: 6, borderRadius: BorderRadius.circular(3)),
              const SizedBox(height: 10),
              Text('v${widget.update.version}$pct', style: const TextStyle(color: kMuted)),
            ]),
            actions: [TextButton(onPressed: _cancel.cancel, child: Text(t.t('cancel')))],
          ),
        );
      case _Phase.error:
        return AlertDialog(
          title: Text(t.t('update_check_failed')),
          content: Text(t.t(_errorKey ?? 'update_download_failed')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: Text(t.t('close'))),
            FilledButton(onPressed: _download, child: Text(t.t('try_again'))),
          ],
        );
      case _Phase.ready:
        final failed = _outcome == InstallOutcome.failed;
        return AlertDialog(
          title: Text(t.t('update_ready')),
          content: Text(failed ? t.t('install_failed') : t.t('install_hint')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: Text(t.t('close'))),
            FilledButton(onPressed: _installerBusy ? null : _install, child: Text(t.t('install'))),
          ],
        );
    }
  }
}
