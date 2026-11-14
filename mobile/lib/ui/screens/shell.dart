import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import 'account_screen.dart';
import 'browse_screen.dart';
import 'cart_screen.dart';
import 'home_screen.dart';
import 'orders_screen.dart';

/// The five tabs. Screens stay alive (IndexedStack) so scroll position and search survive tab switches.
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _index = 0;
  final _browseKey = GlobalKey<BrowseScreenState>();

  void _goToShop({String? query}) {
    setState(() => _index = 1);
    _browseKey.currentState?.focusSearch(query);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<LocaleController>();
    final cart = context.watch<CartController>();
    final session = context.watch<SessionController>();

    if (session.sessionExpired) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        session.sessionExpired = false;
        showSnack(context, 'Your session expired. Please log in again.', error: true);
      });
    }

    final pages = [
      HomeScreen(goToShop: _goToShop),
      BrowseScreen(key: _browseKey),
      CartScreen(goToShop: () => _goToShop()),
      const OrdersScreen(),
      const AccountScreen(),
    ];
    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: t.t('home')),
          NavigationDestination(icon: const Icon(Icons.storefront_outlined), selectedIcon: const Icon(Icons.storefront), label: t.t('browse')),
          NavigationDestination(
            icon: Badge(isLabelVisible: cart.count > 0, label: Text('${cart.count}'), child: const Icon(Icons.shopping_bag_outlined)),
            selectedIcon: Badge(isLabelVisible: cart.count > 0, label: Text('${cart.count}'), child: const Icon(Icons.shopping_bag)),
            label: t.t('bag'),
          ),
          NavigationDestination(icon: const Icon(Icons.receipt_long_outlined), selectedIcon: const Icon(Icons.receipt_long), label: t.t('orders')),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: t.t('account')),
        ],
      ),
    );
  }
}
