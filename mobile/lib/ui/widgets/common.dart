import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../state/l10n.dart';
import '../theme.dart';
import '../icons.dart';

/// Network image with a neutral placeholder; relative `/uploads/..` paths resolve against the server.
class NetImage extends StatelessWidget {
  const NetImage(this.path, {super.key, this.fit = BoxFit.cover, this.radius = 0, this.icon = Zi.image});
  final String? path;
  final BoxFit fit;
  final double radius;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final url = context.read<ApiClient>().absoluteUrl(path);
    final placeholder = Container(
      color: const Color(0xFFEFE9DB),
      alignment: Alignment.center,
      child: Icon(icon, color: const Color(0xFF9C9686), size: 32),
    );
    final child = url.isEmpty
        ? placeholder
        : CachedNetworkImage(
            imageUrl: url,
            fit: fit,
            placeholder: (_, _) => placeholder,
            errorWidget: (_, _, _) => placeholder,
          );
    return radius > 0 ? ClipRRect(borderRadius: BorderRadius.circular(radius), child: child) : child;
  }
}

class Money extends StatelessWidget {
  const Money(this.value, {super.key, this.style});
  final double value;
  final TextStyle? style;
  @override
  Widget build(BuildContext context) {
    final bn = context.watch<LocaleController>().isBn;
    return Text(formatMoney(value, bn: bn), style: style ?? const TextStyle(fontWeight: FontWeight.w600));
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.subtitle, this.action});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 64, color: const Color(0xFF9C9686)),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center, style: serif(18)),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(subtitle!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF6B665C))),
            ],
            if (action != null) ...[const SizedBox(height: 18), action!],
          ]),
        ),
      );
}

class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => EmptyState(
        icon: Zi.offline,
        title: message,
        action: SizedBox(width: 180, child: OutlinedButton(onPressed: onRetry, child: Text(context.tr('retry')))),
      );
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  static Color colorFor(String s) {
    switch (s) {
      case 'DELIVERED':
        return const Color(0xFF56653F);
      case 'SHIPPED':
        return const Color(0xFF56653F);
      case 'CANCELLED':
      case 'REFUSED':
        return const Color(0xFFB3382C);
      case 'PENDING_PAYMENT':
      case 'PLACING':
        return const Color(0xFFD97706);
      default:
        return const Color(0xFF55514A);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = colorFor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(context.tr('status_$status'), style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  final m = ScaffoldMessenger.of(context);
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Text(message),
    behavior: SnackBarBehavior.floating,
    backgroundColor: error ? const Color(0xFFB3382C) : kBrand,
  ));
}

String errorText(Object e) => e is ApiException ? e.message : 'Something went wrong. Please try again.';
