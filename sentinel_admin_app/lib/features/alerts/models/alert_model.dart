import 'package:equatable/equatable.dart';

/// Parsed, UI-ready representation of an incoming FCM push — decoupled from
/// [RemoteMessage] so the overlay widget and controller don't depend on the
/// firebase_messaging package directly.
class SecurityAlert extends Equatable {
  const SecurityAlert({
    required this.title,
    required this.body,
    required this.threatType,
    this.incidentId,
  });

  final String title;
  final String body;
  final String threatType; // drives overlay color via AppColors.forThreatType
  final String? incidentId; // used to deep-link "Review Event"

  @override
  List<Object?> get props => [title, body, threatType, incidentId];
}
