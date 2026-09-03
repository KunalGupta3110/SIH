import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/dashboard/presentation/dashboard_screen.dart';
import '../../features/enrollment/presentation/face_enrollment_screen.dart';
import '../../features/incidents/presentation/incident_detail_screen.dart';
import '../../features/incidents/presentation/incident_timeline_screen.dart';
import '../../shared/widgets/app_shell.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      ShellRoute(
        builder: (context, state, child) {
          return AppShell(location: state.uri.toString(), child: child);
        },
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const DashboardScreen(),
          ),
          GoRoute(
            path: '/incidents',
            builder: (context, state) => const IncidentTimelineScreen(),
          ),
          GoRoute(
            path: '/enroll',
            builder: (context, state) => const FaceEnrollmentScreen(),
          ),
        ],
      ),
      // Pushed outside the shell so it gets a normal back arrow instead of
      // the persistent bottom nav bar.
      GoRoute(
        path: '/incidents/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return IncidentDetailScreen(incidentId: id);
        },
      ),
    ],
  );
});
