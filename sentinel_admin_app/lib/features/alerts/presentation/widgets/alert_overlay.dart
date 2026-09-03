// The alarm overlay. Deliberately not a Dialog or SnackBar — both are easy
// to miss or accidentally swipe away. This is a full-bleed, scrim-backed
// panel with a pulsing border in the threat's severity color, so a fire
// alert and an unverified-person alert are visually distinct at a glance,
// and the operator has to make an explicit choice (Review or Dismiss)
// rather than have it time out silently.
library;

import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../models/alert_model.dart';

class AlertOverlay extends StatefulWidget {
  const AlertOverlay({
    super.key,
    required this.alert,
    required this.onDismiss,
    required this.onReview,
  });

  final SecurityAlert alert;
  final VoidCallback onDismiss;
  final VoidCallback onReview;

  @override
  State<AlertOverlay> createState() => _AlertOverlayState();
}

class _AlertOverlayState extends State<AlertOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final severity = AppColors.forThreatType(widget.alert.threatType);

    return Material(
      color: Colors.black.withOpacity(0.88),
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: AnimatedBuilder(
              animation: _pulse,
              builder: (context, child) {
                return Container(
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: severity.withOpacity(0.4 + _pulse.value * 0.5),
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: severity.withOpacity(0.25 + _pulse.value * 0.2),
                        blurRadius: 30,
                        spreadRadius: 4,
                      ),
                    ],
                  ),
                  child: child,
                );
              },
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_iconFor(widget.alert.threatType), color: severity, size: 48),
                    const SizedBox(height: 16),
                    Text(
                      widget.alert.title,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      widget.alert.body,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                    ),
                    const SizedBox(height: 28),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: widget.onDismiss,
                            child: const Text('Dismiss'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(backgroundColor: severity),
                            onPressed: widget.onReview,
                            child: const Text('Review Event'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  IconData _iconFor(String threatType) {
    switch (threatType) {
      case 'fire':
        return Icons.local_fire_department_rounded;
      case 'smoke':
        return Icons.cloud_outlined;
      case 'unknown_person':
        return Icons.person_search_rounded;
      default:
        return Icons.warning_amber_rounded;
    }
  }
}
