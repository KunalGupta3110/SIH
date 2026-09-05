import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Wraps the three primary destinations (Dashboard, Timeline, Enroll) in a
/// persistent bottom nav bar via go_router's [ShellRoute]. The incident
/// detail screen and any future full-screen flows are pushed outside this
/// shell so they get their own back button instead of the tab bar.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.child, required this.location});

  final Widget child;
  final String location;

  static const _tabs = ['/', '/incidents', '/enroll'];

  int get _currentIndex {
    if (location.startsWith('/incidents')) return 1;
    if (location.startsWith('/enroll')) return 2;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => context.go(_tabs[index]),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard_outlined),
            activeIcon: Icon(Icons.dashboard_rounded),
            label: 'Dashboard',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history_outlined),
            activeIcon: Icon(Icons.history_rounded),
            label: 'Timeline',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.face_outlined),
            activeIcon: Icon(Icons.face_rounded),
            label: 'Enroll',
          ),
        ],
      ),
    );
  }
}
