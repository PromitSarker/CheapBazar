import 'package:flutter/material.dart';
import '../icons.dart';
import 'package:provider/provider.dart';

import '../../state/cart.dart';
import '../../state/l10n.dart';
import '../../state/session.dart';
import '../widgets/common.dart';
import 'account_screen.dart';
import '../widgets/cart_bar.dart';
import 'cart_screen.dart';
import 'categories_screen.dart';
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

  void _goTo(int i) => setState(() => _index = i);

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
      HomeScreen(goToCategories: () => _goTo(1)),
      const CategoriesScreen(),
      CartScreen(goToShop: () => _goTo(0)),
      const OrdersScreen(),
      const AccountScreen(),
    ];
    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: Column(mainAxisSize: MainAxisSize.min, children: [
        // The sticky bag strip only while browsing (Home, Categories); the Bag tab already shows everything.
        if (_index <= 1) CartBar(onTap: () => _goTo(2)),
        const Divider(height: 1),
        NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(icon: const Icon(Zi.home), selectedIcon: const Icon(Zi.homeOn), label: t.t('home')),
          NavigationDestination(icon: const Icon(Zi.categories), selectedIcon: const Icon(Zi.categoriesOn), label: t.t('categories')),
          NavigationDestination(
            icon: Badge(isLabelVisible: cart.count > 0, label: Text('${cart.count}'), child: const Icon(Zi.bag)),
            selectedIcon: Badge(isLabelVisible: cart.count > 0, label: Text('${cart.count}'), child: const Icon(Zi.bagOn)),
            label: t.t('bag'),
          ),
          NavigationDestination(icon: const Icon(Zi.orders), selectedIcon: const Icon(Zi.ordersOn), label: t.t('orders')),
          NavigationDestination(icon: const Icon(Zi.account), selectedIcon: const Icon(Zi.accountOn), label: t.t('account')),
        ],
      ),
      ]),
    );
  }
}
