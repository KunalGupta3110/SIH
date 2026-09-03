import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../models/node_status_model.dart';
import 'status_pulse_dot.dart';

class NodeStatusCard extends StatelessWidget {
  const NodeStatusCard({super.key, required this.status});

  final NodeStatus status;

  @override
  Widget build(BuildContext context) {
    final online = status.isOnline;
    final accent = online ? AppColors.sentinelCyan : AppColors.offlineGray;
    final heartbeat = DateFormat('HH:mm:ss').format(status.lastHeartbeat);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            PulsingStatusDot(color: accent, animate: online),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    online ? 'EDGE NODE ONLINE' : 'EDGE NODE OFFLINE',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: accent,
                          letterSpacing: 0.3,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text('last heartbeat', style: AppTheme.readout),
                      const SizedBox(width: 6),
                      Text(heartbeat, style: AppTheme.readoutEmphasis),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${status.activeCameraCount} cameras streaming',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
