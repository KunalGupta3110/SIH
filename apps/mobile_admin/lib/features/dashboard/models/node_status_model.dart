import 'package:equatable/equatable.dart';

enum NodeConnection { online, offline }

enum ArmState { armed, disarmed }

/// Snapshot of the edge appliance's reported state, plus a rollup of recent
/// activity for the dashboard's summary strip.
class NodeStatus extends Equatable {
  const NodeStatus({
    required this.connection,
    required this.armState,
    required this.lastHeartbeat,
    required this.activeCameraCount,
    required this.eventsLast24h,
    required this.unverifiedFacesLast24h,
  });

  final NodeConnection connection;
  final ArmState armState;
  final DateTime lastHeartbeat;
  final int activeCameraCount;
  final int eventsLast24h;
  final int unverifiedFacesLast24h;

  bool get isOnline => connection == NodeConnection.online;
  bool get isArmed => armState == ArmState.armed;

  NodeStatus copyWith({
    NodeConnection? connection,
    ArmState? armState,
    DateTime? lastHeartbeat,
    int? activeCameraCount,
    int? eventsLast24h,
    int? unverifiedFacesLast24h,
  }) {
    return NodeStatus(
      connection: connection ?? this.connection,
      armState: armState ?? this.armState,
      lastHeartbeat: lastHeartbeat ?? this.lastHeartbeat,
      activeCameraCount: activeCameraCount ?? this.activeCameraCount,
      eventsLast24h: eventsLast24h ?? this.eventsLast24h,
      unverifiedFacesLast24h:
          unverifiedFacesLast24h ?? this.unverifiedFacesLast24h,
    );
  }

  @override
  List<Object?> get props => [
        connection,
        armState,
        lastHeartbeat,
        activeCameraCount,
        eventsLast24h,
        unverifiedFacesLast24h,
      ];
}
