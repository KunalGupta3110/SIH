// Business logic for the dashboard, separated from presentation.
// The screen only ever reads [dashboardControllerProvider] and calls
// [DashboardController.toggleArmState] — it never talks to the repository
// or constructs a NodeStatus itself.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/dashboard_repository.dart';
import '../models/node_status_model.dart';

class DashboardController extends StateNotifier<AsyncValue<NodeStatus>> {
  DashboardController(this._repository) : super(const AsyncValue.loading()) {
    refresh();
  }

  final DashboardRepository _repository;

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    try {
      final status = await _repository.fetchStatus();
      state = AsyncValue.data(status);
    } catch (error, stack) {
      state = AsyncValue.error(error, stack);
    }
  }

  /// Optimistically flips the arm/disarm toggle, then confirms with the
  /// backend; rolls back on failure so the UI never lies about real state.
  Future<void> toggleArmState() async {
    final current = state.value;
    if (current == null) return;

    final next = current.isArmed ? ArmState.disarmed : ArmState.armed;
    state = AsyncValue.data(current.copyWith(armState: next));

    try {
      final confirmed = await _repository.setArmState(next);
      state = AsyncValue.data(confirmed);
    } catch (_) {
      // Roll back to the last known-good state on failure.
      state = AsyncValue.data(current);
    }
  }
}

final dashboardControllerProvider =
    StateNotifierProvider<DashboardController, AsyncValue<NodeStatus>>((ref) {
  return DashboardController(ref.watch(dashboardRepositoryProvider));
});
