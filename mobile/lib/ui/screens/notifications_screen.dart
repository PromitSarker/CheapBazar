import 'package:flutter/material.dart';
import '../icons.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import 'orders_screen.dart';
import 'pro_screen.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  Future<List<AppNotification>>? _future;
  String? _lang;

  Future<List<AppNotification>> _load(String lang) async {
    final r = (await context.read<ApiClient>().get('/notifications', query: {'lang': lang})) as Map<String, dynamic>;
    return ((r['items'] as List?) ?? const []).map((e) => AppNotification.fromJson((e as Map).cast<String, dynamic>())).toList();
  }

  Future<void> _markAll() async {
    await context.read<ApiClient>().post('/notifications/read', {'all': true});
    if (!mounted) return;
    await context.read<SessionController>().refreshUnread();
    setState(() => _future = _load(_lang!));
  }

  void _open(AppNotification n) async {
    if (!n.read) {
      context.read<ApiClient>().post('/notifications/read', {'ids': [n.id]}).then((_) {
        if (mounted) context.read<SessionController>().refreshUnread();
      }).catchError((_) {});
    }
    final l = n.link ?? '';
    if (l.startsWith('/orders')) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersScreen()));
    } else if (l.startsWith('/pro')) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const ProScreen()));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    if (_lang != t.lang) {
      _lang = t.lang;
      _future = _load(t.lang);
    }
    return Scaffold(
      appBar: AppBar(title: Text(t.t('notifications')), actions: [TextButton(onPressed: _markAll, child: Text(t.t('mark_all_read')))]),
      body: RefreshIndicator(
        onRefresh: () async {
          setState(() => _future = _load(t.lang));
          await _future!.catchError((_) => <AppNotification>[]);
        },
        child: FutureBuilder<List<AppNotification>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (snap.hasError) return ListView(children: [SizedBox(height: 420, child: ErrorRetry(message: errorText(snap.error!), onRetry: () => setState(() => _future = _load(t.lang))))]);
            final items = snap.data!;
            if (items.isEmpty) return ListView(children: [SizedBox(height: 420, child: EmptyState(icon: Zi.bell, title: t.t('no_notifications')))]);
            return ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final n = items[i];
                return ListTile(
                  tileColor: n.read ? null : const Color(0xFFEFE9DB),
                  leading: Icon(n.read ? Zi.bell : Zi.bellOn, color: n.read ? const Color(0xFF9C9686) : const Color(0xFF56653F)),
                  title: Text(n.title, style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.w600)),
                  subtitle: Text(n.body),
                  onTap: () => _open(n),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
