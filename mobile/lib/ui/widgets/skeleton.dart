import 'package:flutter/material.dart';

/// A softly pulsing grey block: the loading state for lists and grids (no spinners on content screens).
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.width, this.height = 16, this.radius = 8});
  final double? width;
  final double height;
  final double radius;
  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(color: const Color(0xFFE3DCCD), borderRadius: BorderRadius.circular(widget.radius)),
      ),
    );
  }
}

/// Placeholder shaped like a product card; [width] null = fills its grid cell.
class ProductCardSkeleton extends StatelessWidget {
  const ProductCardSkeleton({super.key, this.width});
  final double? width;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AspectRatio(aspectRatio: 1, child: Skeleton(height: double.infinity, radius: 12)),
          SizedBox(height: 10),
          Skeleton(height: 12),
          SizedBox(height: 6),
          Skeleton(width: 70, height: 12),
          SizedBox(height: 10),
          Skeleton(width: 90, height: 16),
        ]),
      );
}
