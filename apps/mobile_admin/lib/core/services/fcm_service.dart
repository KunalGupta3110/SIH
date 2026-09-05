// Firebase Cloud Messaging integration.
//
// Three things have to work for a security app's push to be trustworthy:
//   1. Foreground messages must surface immediately as an in-app alarm
//      overlay (handled by AlertController, which subscribes to
//      [FcmService.onMessage]), not just a quiet snackbar.
//   2. Background/terminated messages must still produce a local
//      notification with a loud, distinct channel — handled by the
//      top-level [firebaseMessagingBackgroundHandler].
//   3. The device's FCM token must be kept in sync with the backend so the
//      cloud knows where to route this admin's alerts.
//
// NOTE: Call `FcmService.initializeBackgroundHandler()` in `main()` BEFORE
// `runApp`, and call `fcmServiceProvider.read(...).init()` once the app
// is mounted (see main.dart).
library;

import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Must be a top-level (or static) function — the platform invokes this in
/// a separate background isolate when a push arrives while the app is
/// killed or backgrounded.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Re-initialize Firebase in this isolate; it has no shared state with the
  // foreground isolate.
  await Firebase.initializeApp();
  await FcmService._showLocalAlarmNotification(message);
}

class FcmService {
  FcmService(this._ref);
  // Kept for future use: reading other providers (e.g. the API client) to
  // POST the synced device token to the backend. See _syncDeviceToken TODO.
  // ignore: unused_field
  final Ref _ref;

  FirebaseMessaging? get _messaging =>
      Firebase.apps.isNotEmpty ? FirebaseMessaging.instance : null;

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static const AndroidNotificationChannel alarmChannel =
      AndroidNotificationChannel(
    'sentinel_alarm_channel',
    'Sentinel Threat Alarms',
    description: 'High-priority alerts for confirmed security threats.',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
  );

  /// Broadcasts every message received while the app is in the foreground.
  /// [AlertController] listens to this to trigger the full-screen overlay.
  final StreamController<RemoteMessage> _foregroundController =
      StreamController<RemoteMessage>.broadcast();
  Stream<RemoteMessage> get onMessage => _foregroundController.stream;

  /// Call once, early in app startup (before runApp).
  static Future<void> initializeBackgroundHandler() async {
    try {
      if (Firebase.apps.isNotEmpty) {
        FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      }
    } catch (e) {
      debugPrint('Background FCM handler setup skipped: $e');
    }
  }

  /// Call once the widget tree is mounted: requests permissions, wires up
  /// the foreground/local-notification channels, and syncs the device token.
  Future<void> init() async {
    if (Firebase.apps.isEmpty) {
      debugPrint('Firebase not initialized. FCM disabled in preview mode.');
      return;
    }

    try {
      final messaging = _messaging;
      if (messaging == null) return;

      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        criticalAlert: true, // iOS: allow bypassing silent mode for threats
      );

      if (!kIsWeb) {
        await _localNotifications
            .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>()
            ?.createNotificationChannel(alarmChannel);

        await _localNotifications.initialize(
          const InitializationSettings(
            android: AndroidInitializationSettings('@mipmap/ic_launcher'),
            iOS: DarwinInitializationSettings(),
          ),
        );
      }

      // Foreground: surface a full alarm overlay instead of a system banner.
      FirebaseMessaging.onMessage.listen((message) {
        _foregroundController.add(message);
      });

      // App was backgrounded, user tapped the system notification to reopen.
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        _foregroundController.add(message);
      });

      await _syncDeviceToken();
      messaging.onTokenRefresh.listen((_) => _syncDeviceToken());
    } catch (e) {
      debugPrint('FCM init error: $e');
    }
  }

  Future<void> _syncDeviceToken() async {
    try {
      final token = await _messaging?.getToken();
      if (token == null) return;
      // TODO: POST token to ApiEndpoints.registerDeviceToken via the
      // repository layer so the backend can target this device.
      if (kDebugMode) {
        debugPrint('FCM device token synced: $token');
      }
    } catch (e) {
      if (kDebugMode) debugPrint('FCM token sync failed: $e');
    }
  }

  static Future<void> _showLocalAlarmNotification(RemoteMessage message) async {
    final plugin = FlutterLocalNotificationsPlugin();
    final notification = message.notification;
    await plugin.show(
      message.hashCode,
      notification?.title ?? 'Sentinel Alert',
      notification?.body ?? 'A security event was detected.',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'sentinel_alarm_channel',
          'Sentinel Threat Alarms',
          channelDescription:
              'High-priority alerts for confirmed security threats.',
          importance: Importance.max,
          priority: Priority.max,
          fullScreenIntent: true,
        ),
        iOS: DarwinNotificationDetails(interruptionLevel: InterruptionLevel.critical),
      ),
    );
  }

  void dispose() {
    _foregroundController.close();
  }
}

final fcmServiceProvider = Provider<FcmService>((ref) {
  final service = FcmService(ref);
  ref.onDispose(service.dispose);
  return service;
});
