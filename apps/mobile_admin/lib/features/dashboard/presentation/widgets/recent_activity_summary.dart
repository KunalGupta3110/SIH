import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../models/node_status_model.dart';

class RecentActivitySummary extends StatelessWidget {
  const RecentActivitySummary({super.key, required this.status});

  final NodeStatus status;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _SummaryTile(
            label: 'Events · 24h',
            value: '${status.eventsLast24h}',
            color: AppColors.hazardOrange,
            icon: Icons.bolt_rounded,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _SummaryTile(
            label: 'Unverified faces',
            value: '${status.unverifiedFacesLast24h}',
            color: AppColors.hazardAmber,
            icon: Icons.face_retouching_natural_rounded,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _SummaryTile(
            label: 'Cameras',
            value: '${status.activeCameraCount}',
            color: AppColors.sentinelCyan,
            icon: Icons.videocam_rounded,
          ),
        ),
      ],
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  final String label;
  final String value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.surfaceBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(height: 10),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}
