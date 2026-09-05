import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../models/incident_model.dart';

class IncidentCard extends StatelessWidget {
  const IncidentCard({super.key, required this.incident, this.onTap});

  final Incident incident;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final severity = AppColors.forThreatType(incident.threatType);
    final isCritical = incident.threatType == ThreatTypes.fire;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: CachedNetworkImage(
                  imageUrl: incident.thumbnailUrl,
                  width: 64,
                  height: 64,
                  fit: BoxFit.cover,
                  placeholder: (context, _) => Container(
                    width: 64,
                    height: 64,
                    color: AppColors.surfaceRaised,
                  ),
                  errorWidget: (context, _, __) => Container(
                    width: 64,
                    height: 64,
                    color: AppColors.surfaceRaised,
                    child: const Icon(Icons.broken_image_outlined,
                        color: AppColors.textSecondary, size: 20),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          margin: const EdgeInsets.only(right: 8),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: severity,
                            boxShadow: isCritical
                                ? [
                                    BoxShadow(
                                      color: severity.withOpacity(0.7),
                                      blurRadius: 6,
                                    ),
                                  ]
                                : null,
                          ),
                        ),
                        Expanded(
                          child: Text(
                            incident.displayTitle,
                            style: Theme.of(context).textTheme.titleMedium,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (!incident.acknowledged)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: severity.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              'NEW',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: severity,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      incident.cameraName,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          DateFormat('MMM d · HH:mm:ss').format(incident.timestamp),
                          style: AppTheme.readout,
                        ),
                        const SizedBox(width: 10),
                        Text(
                          '${(incident.confidence * 100).toStringAsFixed(0)}% conf.',
                          style: AppTheme.readout,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
