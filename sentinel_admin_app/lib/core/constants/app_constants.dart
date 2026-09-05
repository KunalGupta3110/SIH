// Centralized constants so the rest of the app never hardcodes a string URL.
// Swap [AppConfig.apiBaseUrl] per-environment (dev/staging/prod) at build time
// via --dart-define, e.g.:
//   flutter run --dart-define=API_BASE_URL=https://api.sentinel.example.com
library;

class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000/v1',
  );

  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 15);
}

/// REST endpoint paths on the FastAPI backend.
class ApiEndpoints {
  ApiEndpoints._();

  static const String nodeStatus = '/edge/status';
  static const String armState = '/edge/arm-state';
  static const String incidents = '/incidents';
  static String incidentById(String id) => '/incidents/$id';
  static const String enrollPerson = '/enrollment/people';
  static const String registerDeviceToken = '/notifications/register-token';
}

/// Threat/event type identifiers used across models, theming, and filters.
/// Keeping these as constants avoids typo-divergence between the UI and
/// whatever string the edge node actually sends in its webhook payload.
class ThreatTypes {
  ThreatTypes._();

  static const String fire = 'fire';
  static const String smoke = 'smoke';
  static const String unknownPerson = 'unknown_person';
  static const String verifiedPerson = 'verified_person';
}
