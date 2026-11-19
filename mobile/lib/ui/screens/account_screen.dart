import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/api_client.dart';
import '../../config.dart';
import '../../state/l10n.dart';
import '../../state/location.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import '../widgets/location_ui.dart';
import '../widgets/update_tile.dart';
import 'auth_screen.dart';
import 'notifications_screen.dart';
import 'pro_screen.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  Future<void> _confirmDelete(BuildContext context) async {
    final t = context.read<LocaleController>();
    final pw = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(t.t('delete_account')),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(t.t('delete_account_hint')),
          const SizedBox(height: 12),
          TextField(controller: pw, obscureText: true, decoration: InputDecoration(labelText: t.t('enter_password_confirm'))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t.t('cancel'))),
          TextButton(onPressed: () => Navigator.pop(context, true), child: Text(t.t('delete'), style: const TextStyle(color: Color(0xFFDC2626)))),
        ],
      ),
    );
    final password = pw.text;
    pw.dispose();
    if (ok != true || password.isEmpty || !context.mounted) return;
    try {
      await context.read<SessionController>().deleteAccount(password);
    } catch (e) {
      if (context.mounted) showSnack(context, errorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final s = context.watch<SessionController>();
    final api = context.read<ApiClient>();
    return Scaffold(
      appBar: AppBar(title: Text(t.t('account'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (!s.loggedIn)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t.t('guest_hint'), style: const TextStyle(height: 1.4)),
                const SizedBox(height: 14),
                FilledButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AuthScreen())), child: Text(t.t('login'))),
                const SizedBox(height: 8),
                OutlinedButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AuthScreen(startOnRegister: true))), child: Text(t.t('register'))),
              ]),
            ),
          )
        else ...[
          Card(
            child: ListTile(
              leading: CircleAvatar(backgroundColor: const Color(0xFF123B32), child: Text(s.user!.name.isEmpty ? '?' : s.user!.name[0].toUpperCase(), style: const TextStyle(color: Colors.white))),
              title: Text(s.user!.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(s.user!.email),
            ),
          ),
          if (!s.user!.isBuyer) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFFDE68A))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t.t('shop_owner_notice'), style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                SelectableText(api.baseUrl, style: const TextStyle(color: Color(0xFF1E7A57))),
              ]),
            ),
          ],
          const SizedBox(height: 10),
          Card(
            child: Column(children: [
              ListTile(
                leading: const Icon(Icons.workspace_premium_outlined),
                title: Text(t.t('buyer_pro')),
                subtitle: Text(s.pro?.active == true ? t.t('pro_active', {'d': s.pro?.currentPeriodEnd == null ? '' : '${s.pro!.currentPeriodEnd!.day}/${s.pro!.currentPeriodEnd!.month}/${s.pro!.currentPeriodEnd!.year}'}) : t.t('pro_inactive')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProScreen())).then((_) => s.refresh()),
              ),
              const Divider(height: 1),
              ListTile(
                leading: Badge(isLabelVisible: s.unread > 0, label: Text('${s.unread}'), child: const Icon(Icons.notifications_none_rounded)),
                title: Text(t.t('notifications')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen())).then((_) => s.refreshUnread()),
              ),
            ]),
          ),
        ],
        const SizedBox(height: 10),
        Builder(builder: (context) {
          final loc = context.watch<LocationController>();
          if (!loc.enabled) return const SizedBox.shrink(); // only while the admin limits shops by distance
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Card(
              child: ListTile(
                leading: const Icon(Icons.place_outlined),
                title: Text(t.t('loc_your_location')),
                subtitle: Text(loc.shortLabel(t.isBn, nearMe: t.t('loc_near_me'), notSet: t.t('loc_set'))),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => showLocationSheet(context),
              ),
            ),
          );
        }),
        Card(
          child: ListTile(
            leading: const Icon(Icons.language),
            title: Text(t.t('language')),
            trailing: SegmentedButton<String>(
              segments: [ButtonSegment(value: 'en', label: Text(t.t('english'))), ButtonSegment(value: 'bn', label: Text(t.t('bangla')))],
              selected: {t.lang},
              showSelectedIcon: false,
              onSelectionChanged: (v) => t.set(v.first),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.info_outline),
              title: Text(t.t('about')),
              subtitle: Text('${t.t('app_name')} · ${t.t('version')} ${AppConfig.version} (${AppConfig.build})'),
              onTap: () => launchUrl(Uri.parse(api.baseUrl), mode: LaunchMode.externalApplication),
            ),
            const Divider(height: 1),
            const UpdateTile(),
          ]),
        ),
        if (s.loggedIn) ...[
          const SizedBox(height: 14),
          OutlinedButton.icon(onPressed: () => s.logout(), icon: const Icon(Icons.logout), label: Text(t.t('logout'))),
          if (s.user!.isBuyer)
            TextButton(
              onPressed: () => _confirmDelete(context),
              child: Text(t.t('delete_account'), style: const TextStyle(color: Color(0xFFDC2626))),
            ),
        ],
      ]),
    );
  }
}
