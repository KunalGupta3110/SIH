import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../models/node_status_model.dart';

/// A deliberately large, unambiguous control — this is the one action an
/// operator must never mis-tap. Full-width, high-contrast, and the label
/// always states the resulting state plainly ("Zones Armed" / "Zones
/// Disarmed"), never a bare on/off switch with no text.
class ArmDisarmToggle extends StatelessWidget {
  const ArmDisarmToggle({
    super.key,
    required this.armState,
    required this.onChanged,
    this.isLoading = false,
  });

  final ArmState armState;
  final ValueChanged<bool> onChanged;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final armed = armState == ArmState.armed;
    final accent = armed ? AppColors.sentinelCyan : AppColors.offlineGray;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: isLoading ? null : () => onChanged(!armed),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.surfaceBorder),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: accent.withOpacity(0.15),
                ),
                child: Icon(
                  armed ? Icons.shield_rounded : Icons.shield_outlined,
                  color: accent,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      armed ? 'Zones Armed' : 'Zones Disarmed',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      armed
                          ? 'Detection active across all linked cameras'
                          : 'Tap to arm and resume automatic threat detection',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              if (isLoading)
                const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                Switch(
                  value: armed,
                  onChanged: onChanged,
                  activeColor: AppColors.sentinelCyan,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
