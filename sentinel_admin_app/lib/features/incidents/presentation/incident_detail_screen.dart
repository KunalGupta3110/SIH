import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../controllers/incident_controller.dart';

class IncidentDetailScreen extends ConsumerWidget {
  const IncidentDetailScreen({super.key, required this.incidentId});

  final String incidentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final incidentAsync = ref.watch(incidentByIdProvider(incidentId));

    return Scaffold(
      appBar: AppBar(title: const Text('Incident Detail')),
      body: incidentAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => const Center(
          child: Text('Could not load this incident.',
              style: TextStyle(color: AppColors.textSecondary)),
        ),
        data: (incident) {
          final severity = AppColors.forThreatType(incident.threatType);
          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AspectRatio(
                  aspectRatio: 4 / 3,
                  child: CachedNetworkImage(
                    imageUrl: incident.detailImageUrl ?? incident.thumbnailUrl,
                    fit: BoxFit.cover,
                    placeholder: (context, _) =>
                        Container(color: AppColors.surfaceRaised),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                                shape: BoxShape.circle, color: severity),
                          ),
                          const SizedBox(width: 8),
                          Text(incident.displayTitle,
                              style: Theme.of(context).textTheme.headlineMedium),
                        ],
                      ),
                      const SizedBox(height: 16),
                      _DetailRow(label: 'Camera', value: incident.cameraName),
                      _DetailRow(
                        label: 'Timestamp',
                        value: DateFormat('EEEE, MMM d · HH:mm:ss')
                            .format(incident.timestamp),
                        mono: true,
                      ),
                      _DetailRow(
                        label: 'Model confidence',
                        value: '${(incident.confidence * 100).toStringAsFixed(1)}%',
                        mono: true,
                      ),
                      _DetailRow(
                        label: 'Status',
                        value: incident.acknowledged ? 'Acknowledged' : 'Needs review',
                      ),
                      if (incident.notes != null) ...[
                        const SizedBox(height: 16),
                        const Text('Notes',
                            style: TextStyle(
                                color: AppColors.textSecondary, fontSize: 12)),
                        const SizedBox(height: 4),
                        Text(incident.notes!,
                            style: Theme.of(context).textTheme.bodyMedium),
                      ],
                      const SizedBox(height: 28),
                      if (!incident.acknowledged)
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () => ref
                                .read(incidentControllerProvider.notifier)
                                .acknowledge(incident.id),
                            child: const Text('Mark as Reviewed'),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value, this.mono = false});

  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          ),
          Expanded(
            child: Text(
              value,
              style: mono ? AppTheme.readoutEmphasis : const TextStyle(fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
