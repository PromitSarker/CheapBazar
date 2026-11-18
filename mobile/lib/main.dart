import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api/api_client.dart';
import 'state/cart.dart';
import 'state/catalog.dart';
import 'state/l10n.dart';
import 'state/location.dart';
import 'state/session.dart';
import 'ui/screens/shell.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  final session = SessionController(api);
  final cart = CartController();
  final locale = LocaleController();
  final location = LocationController(api);
  await Future.wait([cart.load(), locale.load(), location.load()]);
  runApp(CheapBazarApp(api: api, session: session, cart: cart, locale: locale, location: location));
}

class CheapBazarApp extends StatelessWidget {
  CheapBazarApp({super.key, required this.api, required this.session, required this.cart, required this.locale, CatalogController? catalog, LocationController? location})
      : catalog = catalog ?? CatalogController(api),
        location = location ?? LocationController(api);
  final ApiClient api;
  final SessionController session;
  final CartController cart;
  final LocaleController locale;
  final CatalogController catalog;
  final LocationController location;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        ChangeNotifierProvider<SessionController>.value(value: session),
        ChangeNotifierProvider<CartController>.value(value: cart),
        ChangeNotifierProvider<LocaleController>.value(value: locale),
        ChangeNotifierProvider<CatalogController>.value(value: catalog),
        ChangeNotifierProvider<LocationController>.value(value: location),
      ],
      child: Consumer<LocaleController>(
        builder: (context, l, _) => MaterialApp(
          title: l.t('app_name'),
          debugShowCheckedModeBanner: false,
          theme: buildTheme(),
          locale: Locale(l.lang),
          home: const _Boot(),
        ),
      ),
    );
  }
}

/// Loads config + session before showing the app; blocks only when the server demands a newer version.
class _Boot extends StatefulWidget {
  const _Boot();
  @override
  State<_Boot> createState() => _BootState();
}

class _BootState extends State<_Boot> {
  late final Future<void> _ready = context.read<SessionController>().bootstrap();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _ready,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return Scaffold(
            backgroundColor: const Color(0xFF123B32),
            body: Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: const [
                Icon(Icons.shopping_bag, color: Color(0xFFBFE5CC), size: 64),
                SizedBox(height: 14),
                Text('Cheap-Bazar', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
                SizedBox(height: 22),
                SizedBox(width: 26, height: 26, child: CircularProgressIndicator(color: Color(0xFFBFE5CC), strokeWidth: 2.4)),
              ]),
            ),
          );
        }
        final s = context.watch<SessionController>();
        if (s.updateRequiredMessage != null) {
          final t = context.watch<LocaleController>();
          return Scaffold(body: Center(child: Padding(padding: const EdgeInsets.all(32), child: Text(t.t('update_required'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 18)))));
        }
        return const Shell();
      },
    );
  }
}
