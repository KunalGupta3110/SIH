// Signature element: a radar-style pulse rather than a static colored dot.
// A security console's core promise is "this is alive right now" — a still
// dot can't say that, but an expanding ring reads as a heartbeat/ping the
// instant you look at it. Used once, on the dashboard's hero status card;
// every other status indicator in the app stays a plain static dot so this
// one carries the weight.
library;

import 'package:flutter/material.dart';

class PulsingStatusDot extends StatefulWidget {
  const PulsingStatusDot({
    super.key,
    required this.color,
    this.size = 14,
    this.animate = true,
  });

  final Color color;
  final double size;
  final bool animate;

  @override
  State<PulsingStatusDot> createState() => _PulsingStatusDotState();
}

class _PulsingStatusDotState extends State<PulsingStatusDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ringSize = widget.size * 3;
    return SizedBox(
      width: ringSize,
      height: ringSize,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (widget.animate)
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                final t = _controller.value;
                return Container(
                  width: ringSize * t,
                  height: ringSize * t,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: widget.color.withOpacity((1 - t) * 0.45),
                  ),
                );
              },
            ),
          Container(
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: widget.color,
              boxShadow: [
                BoxShadow(
                  color: widget.color.withOpacity(0.6),
                  blurRadius: 6,
                  spreadRadius: 1,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
