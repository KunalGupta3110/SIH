# Sentinel Admin App

Cross-platform Flutter scaffold for the **Administrator Control App** of the
AI Edge Security & Safety Ecosystem — dashboard, incident timeline, face
enrollment, and real-time FCM alarm handling.

This package contains `lib/`, `pubspec.yaml`, and config files only. It is
**not** a fully scaffolded Flutter project (no `android/`/`ios`/`web`
folders) — see Setup below to generate those.

---

## 1. Setup

```bash
# 1. Create the platform scaffolding in this same folder (answer "y" to
#    overwrite pubspec.yaml — your version above is the one that matters,
#    but flutter create will also ask before touching it; keep this one).
flutter create --org com.yourcompany --project-name sentinel_admin_app .

# 2. Install dependencies
flutter pub get

# 3. Connect Firebase (generates lib/firebase_options.dart and platform
#    config files — see .gitignore, these are intentionally not committed)
dart pub global activate flutterfire_cli
flutterfire configure

# 4. Uncomment the Firebase options import/usage in lib/main.dart:
#      import 'firebase_options.dart';
#      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

# 5. Add the two font families referenced in pubspec.yaml (Space Grotesk,
#    JetBrains Mono — both free/open) into assets/fonts/, matching the
#    filenames already listed in pubspec.yaml. Or delete the `fonts:` block
#    to fall back to the system default font.

# 6. Run
flutter run
```

### Platform permissions to add after `flutter create`
- **Android** (`android/app/src/main/AndroidManifest.xml`): `CAMERA`,
  `INTERNET`, `POST_NOTIFICATIONS` (API 33+), and a `<meta-data>` for the
  default notification channel (`sentinel_alarm_channel`) if you want it
  set without a runtime call.
- **iOS** (`ios/Runner/Info.plist`): `NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`, and enable the **Push Notifications** +
  **Background Modes → Remote notifications** capabilities in Xcode.

---

## 2. What's mocked vs. real

Everything runs **today**, with zero backend, via mock repositories:

| Feature | Mock data lives in | Swap to live backend by |
|---|---|---|
| Dashboard / arm-disarm | `features/dashboard/data/dashboard_repository.dart` | Uncomment `RestDashboardRepository` in `dashboardRepositoryProvider` |
| Incident timeline | `features/incidents/data/incident_repository.dart` | Uncomment `RestIncidentRepository` in `incidentRepositoryProvider` |
| Face enrollment | `features/enrollment/data/enrollment_repository.dart` | Uncomment `RestEnrollmentRepository` in `enrollmentRepositoryProvider` |

Each `Rest*Repository` is already written against the FastAPI endpoints
implied by the proposal (`core/constants/app_constants.dart` →
`ApiEndpoints`) — adjust paths/payload shapes to match your actual API
contract, then flip the one-line provider swap. No UI or controller code
needs to change.

**FCM alerts are real**, not mocked — `FcmService` and `AlertController`
wire up actual Firebase listeners. To test the full-screen alarm overlay
without a backend yet, send a test push from the Firebase console with a
data payload like:
```json
{ "threat_type": "fire", "incident_id": "evt_1001" }
```
and a notification title/body — the overlay reads `data.threat_type` to
pick its color/icon and `data.incident_id` to deep-link "Review Event".

---

## 3. Architecture

```
lib/
├── main.dart              # Firebase init + FCM background handler registration
├── app.dart                # MaterialApp.router + global alarm overlay
├── core/
│   ├── theme/               # Design tokens: app_colors.dart, app_theme.dart
│   ├── router/              # go_router config (app_router.dart)
│   ├── services/            # Dio client, FCM service — no UI knowledge
│   └── constants/           # API endpoints, threat-type strings
├── shared/widgets/          # Cross-feature widgets (bottom-nav shell)
└── features/
    ├── dashboard/            # models/ data/ controllers/ presentation/
    ├── incidents/            # same 4-layer split
    ├── enrollment/            # same 4-layer split
    └── alerts/                # FCM → SecurityAlert → full-screen overlay
```

Each feature follows the same **4-layer split**:
- `models/` — plain data classes (Equatable, no Flutter imports)
- `data/` — `Repository` abstract interface + `Mock*`/`Rest*` implementations
- `controllers/` — Riverpod `StateNotifier`s; the only thing screens talk to
- `presentation/` — screens + their feature-local widgets only

State management is **Riverpod** throughout (`StateNotifierProvider` for
mutable feature state, `FutureProvider.family` for one-off lookups like a
single incident by id). Screens never construct a repository or touch
`Dio`/`Firebase` directly — only controllers do.

---

## 4. Design system rationale

The palette and type pairing (see `core/theme/`) were chosen deliberately
rather than defaulted to Material's stock dark theme:

- **Near-black, blue-tinted background** (`#0A0D12`) — most of these units
  sit on a wall or desk in a dim room; pure black or stock `Colors.grey900`
  reads as unfinished.
- **One calm accent (Sentinel Cyan)** for "armed / online / alive" — never
  alarming, since this is the state the operator sees 99% of the time.
- **Two-tier hazard scale** (Amber → Red) so severity is encoded in hue, not
  just label text: Amber = needs review, Red = confirmed fire/critical.
- **Two-typeface system**: SpaceGrotesk for everything a human wrote
  (labels, titles, body), JetBrainsMono for everything a sensor reported
  (timestamps, confidence scores, coordinates) — see `AppTheme.readout`.
- **Signature element**: the pulsing radar-style dot on the dashboard's
  status card (`PulsingStatusDot`) — a static dot can't say "this is alive
  right now," an expanding ring can.

---

## 5. Known gaps to fill before production

- `core/services/api_client.dart` has a `TODO` for injecting the signed-in
  admin's bearer token — there's no auth flow in this scaffold yet.
- `FcmService._syncDeviceToken` logs the token but doesn't POST it anywhere
  yet — wire it to `ApiEndpoints.registerDeviceToken` once auth exists.
- No persistent local cache — incident timeline and enrolled-person lists
  refetch on every cold start (acceptable for v1, add e.g. `drift`/Hive if
  offline viewing matters later).
