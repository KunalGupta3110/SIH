import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/services/fcm_service.dart';

// TODO: run `flutterfire configure` to generate this file for your project.
// import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await Firebase.initializeApp(
      // options: DefaultFirebaseOptions.currentPlatform,
    );

    // Must be registered before runApp so a killed app can still handle a
    // push that arrives while it's not running.
    await FcmService.initializeBackgroundHandler();
  } catch (e) {
    debugPrint('Firebase not initialized (running in offline/mock preview mode): $e');
  }

  runApp(
    const ProviderScope(
      child: _AppBootstrap(),
    ),
  );
}

/// Performs the FCM foreground setup once the widget tree (and therefore
/// the ProviderScope/Riverpod container) actually exists, then hands off to
/// [SentinelApp].
class _AppBootstrap extends ConsumerStatefulWidget {
  const _AppBootstrap();

  @override
  ConsumerState<_AppBootstrap> createState() => _AppBootstrapState();
}

class _AppBootstrapState extends ConsumerState<_AppBootstrap> {
  @override
  void initState() {
    super.initState();
    // Deferred to post-frame so the first build completes before we touch
    // platform channels / request permissions.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await ref.read(fcmServiceProvider).init();
      } catch (e) {
        debugPrint('FCM init skipped: $e');
      }
    });
  }

  @override
  Widget build(BuildContext context) => const SentinelApp();
}
