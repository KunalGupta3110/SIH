import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/alerts/controllers/alert_controller.dart';
import 'features/alerts/presentation/widgets/alert_overlay.dart';

class SentinelApp extends ConsumerWidget {
  const SentinelApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final activeAlert = ref.watch(alertControllerProvider);

    return MaterialApp.router(
      title: 'Sentinel Admin',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      routerConfig: router,
      // The alarm overlay renders above every route, regardless of which
      // tab the operator is on — a fire alert must interrupt the enrollment
      // flow just as readily as the dashboard.
      builder: (context, child) {
        return Stack(
          children: [
            if (child != null) child,
            if (activeAlert != null)
              AlertOverlay(
                alert: activeAlert,
                onDismiss: () => ref.read(alertControllerProvider.notifier).dismiss(),
                onReview: () {
                  final incidentId = activeAlert.incidentId;
                  ref.read(alertControllerProvider.notifier).dismiss();
                  // Navigate via the router instance directly rather than
                  // context.go() — this Stack sits in MaterialApp.router's
                  // `builder`, which is *outside* the Router/Navigator
                  // subtree, so InheritedGoRouter isn't reachable from here.
                  router.go(incidentId != null ? '/incidents/$incidentId' : '/incidents');
                },
              ),
          ],
        );
      },
    );
  }
}
