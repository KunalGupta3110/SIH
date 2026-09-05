import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../controllers/incident_controller.dart';
import 'widgets/incident_card.dart';

class IncidentTimelineScreen extends ConsumerWidget {
  const IncidentTimelineScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final incidentsAsync = ref.watch(incidentControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Incident Timeline')),
      body: incidentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Failed to load incidents.',
                  style: TextStyle(color: AppColors.textSecondary)),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => ref.read(incidentControllerProvider.notifier).refresh(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (incidents) {
          if (incidents.isEmpty) {
            return const Center(
              child: Text(
                'No security events recorded yet.',
                style: TextStyle(color: AppColors.textSecondary),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(incidentControllerProvider.notifier).refresh(),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: incidents.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final incident = incidents[index];
                return IncidentCard(
                  incident: incident,
                  onTap: () => context.go('/incidents/${incident.id}'),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
