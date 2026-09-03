// Repository pattern: the UI/controller only ever depends on the abstract
// [DashboardRepository]. [MockDashboardRepository] lets every screen be
// previewed and demoed with zero backend running; swap the provider override
// in main.dart to [RestDashboardRepository] once the FastAPI endpoints exist.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/services/api_client.dart';
import '../models/node_status_model.dart';

abstract class DashboardRepository {
  Future<NodeStatus> fetchStatus();
  Future<NodeStatus> setArmState(ArmState state);
}

class MockDashboardRepository implements DashboardRepository {
  NodeStatus _current = NodeStatus(
    connection: NodeConnection.online,
    armState: ArmState.armed,
    lastHeartbeat: DateTime.now().subtract(const Duration(seconds: 12)),
    activeCameraCount: 6,
    eventsLast24h: 4,
    unverifiedFacesLast24h: 1,
  );

  @override
  Future<NodeStatus> fetchStatus() async {
    await Future.delayed(const Duration(milliseconds: 400));
    return _current;
  }

  @override
  Future<NodeStatus> setArmState(ArmState state) async {
    await Future.delayed(const Duration(milliseconds: 300));
    _current = _current.copyWith(armState: state);
    return _current;
  }
}

class RestDashboardRepository implements DashboardRepository {
  RestDashboardRepository(this._dio);
  final Dio _dio;

  @override
  Future<NodeStatus> fetchStatus() async {
    final response = await _dio.get(ApiEndpoints.nodeStatus);
    return _fromJson(response.data as Map<String, dynamic>);
  }

  @override
  Future<NodeStatus> setArmState(ArmState state) async {
    final response = await _dio.post(
      ApiEndpoints.armState,
      data: {'arm_state': state == ArmState.armed ? 'armed' : 'disarmed'},
    );
    return _fromJson(response.data as Map<String, dynamic>);
  }

  NodeStatus _fromJson(Map<String, dynamic> json) {
    return NodeStatus(
      connection: json['connection'] == 'online'
          ? NodeConnection.online
          : NodeConnection.offline,
      armState:
          json['arm_state'] == 'armed' ? ArmState.armed : ArmState.disarmed,
      lastHeartbeat: DateTime.parse(json['last_heartbeat'] as String),
      activeCameraCount: json['active_camera_count'] as int,
      eventsLast24h: json['events_last_24h'] as int,
      unverifiedFacesLast24h: json['unverified_faces_last_24h'] as int,
    );
  }
}

/// Swap this single provider to flip the whole app from mock to live data.
final dashboardRepositoryProvider = Provider<DashboardRepository>((ref) {
  return RestDashboardRepository(ref.watch(apiClientProvider));
});
