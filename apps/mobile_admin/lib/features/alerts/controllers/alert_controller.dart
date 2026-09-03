// Bridges raw FCM [RemoteMessage]s to a UI-ready [SecurityAlert] that the
// full-screen overlay (see widgets/alert_overlay.dart) renders. Kept as its
// own controller — rather than handling RemoteMessage in the widget tree
// directly — so the parsing/mapping logic is unit-testable and the overlay
// stays a pure presentation widget.
library;

import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/services/fcm_service.dart';
import '../models/alert_model.dart';

class AlertController extends StateNotifier<SecurityAlert?> {
  AlertController(this._ref) : super(null) {
    _subscription = _ref.read(fcmServiceProvider).onMessage.listen(_handleMessage);
  }

  final Ref _ref;
  late final StreamSubscription<RemoteMessage> _subscription;

  void _handleMessage(RemoteMessage message) {
    final notification = message.notification;
    final data = message.data;

    state = SecurityAlert(
      title: notification?.title ?? 'Security Alert',
      body: notification?.body ?? 'A new event was detected.',
      threatType: data['threat_type'] as String? ?? ThreatTypes.unknownPerson,
      incidentId: data['incident_id'] as String?,
    );
  }

  /// Used by widget tests / demo buttons to simulate a push without FCM.
  void simulate(SecurityAlert alert) => state = alert;

  void dismiss() => state = null;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

final alertControllerProvider =
    StateNotifierProvider<AlertController, SecurityAlert?>(
  (ref) => AlertController(ref),
);
