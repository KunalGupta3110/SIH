library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/services/api_client.dart';
import '../models/incident_model.dart';

abstract class IncidentRepository {
  Future<List<Incident>> fetchTimeline();
  Future<Incident> fetchById(String id);
  Future<Incident> acknowledge(String id);
}

class MockIncidentRepository implements IncidentRepository {
  final List<Incident> _incidents = [
    Incident(
      id: 'evt_1001',
      threatType: ThreatTypes.fire,
      timestamp: DateTime.now().subtract(const Duration(minutes: 6)),
      cameraName: 'Warehouse Dock — Cam 3',
      thumbnailUrl: 'https://picsum.photos/seed/fire1/400/400',
      detailImageUrl: 'https://picsum.photos/seed/fire1/1200/900',
      confidence: 0.94,
      notes: 'Flame signature in lower-left quadrant, near pallet racking.',
    ),
    Incident(
      id: 'evt_1000',
      threatType: ThreatTypes.unknownPerson,
      timestamp: DateTime.now().subtract(const Duration(minutes: 42)),
      cameraName: 'Front Entrance — Cam 1',
      thumbnailUrl: 'https://picsum.photos/seed/person1/400/400',
      detailImageUrl: 'https://picsum.photos/seed/person1/1200/900',
      confidence: 0.81,
      notes: 'No match found against enrolled face vectors.',
    ),
    Incident(
      id: 'evt_0998',
      threatType: ThreatTypes.smoke,
      timestamp: DateTime.now().subtract(const Duration(hours: 3)),
      cameraName: 'Server Room — Cam 5',
      thumbnailUrl: 'https://picsum.photos/seed/smoke1/400/400',
      detailImageUrl: 'https://picsum.photos/seed/smoke1/1200/900',
      confidence: 0.77,
      acknowledged: true,
    ),
    Incident(
      id: 'evt_0991',
      threatType: ThreatTypes.verifiedPerson,
      timestamp: DateTime.now().subtract(const Duration(hours: 5)),
      cameraName: 'Rear Loading Bay — Cam 4',
      thumbnailUrl: 'https://picsum.photos/seed/verified1/400/400',
      detailImageUrl: 'https://picsum.photos/seed/verified1/1200/900',
      confidence: 0.98,
      notes: 'Matched: J. Alvarez (Facilities).',
      acknowledged: true,
    ),
    Incident(
      id: 'evt_0980',
      threatType: ThreatTypes.unknownPerson,
      timestamp: DateTime.now().subtract(const Duration(hours: 19)),
      cameraName: 'Parking Lot — Cam 2',
      thumbnailUrl: 'https://picsum.photos/seed/person2/400/400',
      detailImageUrl: 'https://picsum.photos/seed/person2/1200/900',
      confidence: 0.69,
      acknowledged: true,
    ),
  ];

  @override
  Future<List<Incident>> fetchTimeline() async {
    await Future.delayed(const Duration(milliseconds: 500));
    final sorted = [..._incidents]
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
    return sorted;
  }

  @override
  Future<Incident> fetchById(String id) async {
    await Future.delayed(const Duration(milliseconds: 200));
    return _incidents.firstWhere((i) => i.id == id);
  }

  @override
  Future<Incident> acknowledge(String id) async {
    await Future.delayed(const Duration(milliseconds: 200));
    final index = _incidents.indexWhere((i) => i.id == id);
    final updated = _incidents[index].copyWith(acknowledged: true);
    _incidents[index] = updated;
    return updated;
  }
}

class RestIncidentRepository implements IncidentRepository {
  RestIncidentRepository(this._dio);
  final Dio _dio;

  @override
  Future<List<Incident>> fetchTimeline() async {
    final response = await _dio.get(ApiEndpoints.incidents);
    final list = response.data as List<dynamic>;
    return list
        .map((json) => _fromJson(json as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<Incident> fetchById(String id) async {
    final response = await _dio.get(ApiEndpoints.incidentById(id));
    return _fromJson(response.data as Map<String, dynamic>);
  }

  @override
  Future<Incident> acknowledge(String id) async {
    final response =
        await _dio.post('${ApiEndpoints.incidentById(id)}/acknowledge');
    return _fromJson(response.data as Map<String, dynamic>);
  }

  Incident _fromJson(Map<String, dynamic> json) {
    return Incident(
      id: json['id'] as String,
      threatType: json['threat_type'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
      cameraName: json['camera_name'] as String,
      thumbnailUrl: json['thumbnail_url'] as String,
      detailImageUrl: json['detail_image_url'] as String?,
      confidence: (json['confidence'] as num).toDouble(),
      notes: json['notes'] as String?,
      acknowledged: json['acknowledged'] as bool? ?? false,
    );
  }
}

final incidentRepositoryProvider = Provider<IncidentRepository>((ref) {
  return MockIncidentRepository();
  // return RestIncidentRepository(ref.watch(apiClientProvider));
});
