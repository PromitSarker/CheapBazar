import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'api/api_client.dart';
import 'state/ads.dart';
import 'state/cart.dart';
import 'state/catalog.dart';
import 'state/l10n.dart';
import 'state/location.dart';
import 'state/session.dart';
import 'ui/screens/shell.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // The bundled heading fonts are SIL OFL: show their licences in the app's "licences" page.
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks(['Newsreader'], await rootBundle.loadString('assets/fonts/OFL-Newsreader.txt'));
    yield LicenseEntryWithLineBreaks(['Phosphor Icons'], await rootBundle.loadString('assets/fonts/MIT-Phosphor.txt'));
    yield LicenseEntryWithLineBreaks(['Noto Serif Bengali'], await rootBundle.loadString('assets/fonts/OFL-NotoSerifBengali.txt'));
  });
  final api = ApiClient();
  final session = SessionController(api);
  final cart = CartController();
  final locale = LocaleController();
  final location = LocationController(api);
  await Future.wait([cart.load(), locale.load(), location.load()]);
  runApp(CheapBazarApp(api: api, session: session, cart: cart, locale: locale, location: location));
}

class CheapBazarApp extends StatelessWidget {
  CheapBazarApp({super.key, required this.api, required this.session, required this.cart, required this.locale, CatalogController? catalog, LocationController? location, AdsController? ads})
      : catalog = catalog ?? CatalogController(api),
        ads = ads ?? AdsController(api),
        location = location ?? LocationController(api);
  final ApiClient api;
  final SessionController session;
  final CartController cart;
  final LocaleController locale;
  final CatalogController catalog;
  final LocationController location;
  final AdsController ads;

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
        ChangeNotifierProvider<AdsController>.value(value: ads),
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
  void initState() {
    super.initState();
    // Never awaited: ads must not delay or break app start.
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<AdsController>().load());
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _ready,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return Scaffold(
            backgroundColor: kWarmWhite,
            body: Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('Cheap-Bazar', style: serif(34, weight: 500)),
                const SizedBox(height: 22),
                const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: kAccent, strokeWidth: 1.6)),
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
