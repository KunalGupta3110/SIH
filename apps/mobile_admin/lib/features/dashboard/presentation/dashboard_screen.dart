import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../incidents/controllers/incident_controller.dart';
import '../../incidents/models/incident_model.dart';
import '../../incidents/presentation/widgets/incident_card.dart';
import '../controllers/dashboard_controller.dart';
import 'widgets/arm_disarm_toggle.dart';
import 'widgets/recent_activity_summary.dart';
import 'widgets/status_card.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(dashboardControllerProvider);
    final recentIncidents = ref.watch(incidentControllerProvider).maybeWhen(
          data: (incidents) => incidents.take(3).toList(),
          orElse: () => <Incident>[],
        );

    return Scaffold(
      appBar: AppBar(title: const Text('Sentinel')),
      body: RefreshIndicator(
        onRefresh: () => ref.read(dashboardControllerProvider.notifier).refresh(),
        child: statusAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => _ErrorState(
            onRetry: () => ref.read(dashboardControllerProvider.notifier).refresh(),
          ),
          data: (status) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              NodeStatusCard(status: status),
              const SizedBox(height: 16),
              ArmDisarmToggle(
                armState: status.armState,
                onChanged: (_) =>
                    ref.read(dashboardControllerProvider.notifier).toggleArmState(),
              ),
              const SizedBox(height: 20),
              Text('Last 24 hours', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              RecentActivitySummary(status: status),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Recent activity', style: Theme.of(context).textTheme.titleMedium),
                  TextButton(
                    onPressed: () => context.go('/incidents'),
                    child: const Text('View all'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (recentIncidents.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: Text(
                      'No events yet — armed zones will report here.',
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                  ),
                )
              else
                ...recentIncidents.map(
                  (incident) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: IncidentCard(
                      incident: incident,
                      onTap: () => context.go('/incidents/${incident.id}'),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.wifi_off_rounded, color: AppColors.textSecondary, size: 36),
          const SizedBox(height: 12),
          const Text(
            'Could not reach the edge node.',
            style: TextStyle(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
