import 'package:equatable/equatable.dart';

/// A single security event reported by the edge node: an unverified face,
/// a verified-but-logged entry, smoke, or fire.
class Incident extends Equatable {
  const Incident({
    required this.id,
    required this.threatType,
    required this.timestamp,
    required this.cameraName,
    required this.thumbnailUrl,
    required this.confidence,
    this.detailImageUrl,
    this.notes,
    this.acknowledged = false,
  });

  final String id;
  final String threatType; // see ThreatTypes in app_constants.dart
  final DateTime timestamp;
  final String cameraName;
  final String thumbnailUrl; // secure S3 URL, expected to be a signed URL
  final double confidence; // 0.0–1.0 model confidence score
  final String? detailImageUrl; // higher-res snapshot for the detail view
  final String? notes;
  final bool acknowledged;

  String get displayTitle {
    switch (threatType) {
      case 'fire':
        return 'Fire Detected';
      case 'smoke':
        return 'Smoke Detected';
      case 'unknown_person':
        return 'Unknown Person Detected';
      case 'verified_person':
        return 'Verified Entry';
      default:
        return 'Event Detected';
    }
  }

  Incident copyWith({bool? acknowledged}) {
    return Incident(
      id: id,
      threatType: threatType,
      timestamp: timestamp,
      cameraName: cameraName,
      thumbnailUrl: thumbnailUrl,
      confidence: confidence,
      detailImageUrl: detailImageUrl,
      notes: notes,
      acknowledged: acknowledged ?? this.acknowledged,
    );
  }

  @override
  List<Object?> get props => [
        id,
        threatType,
        timestamp,
        cameraName,
        thumbnailUrl,
        confidence,
        detailImageUrl,
        notes,
        acknowledged,
      ];
}
