library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/incident_repository.dart';
import '../models/incident_model.dart';

class IncidentController extends StateNotifier<AsyncValue<List<Incident>>> {
  IncidentController(this._repository) : super(const AsyncValue.loading()) {
    refresh();
  }

  final IncidentRepository _repository;

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    try {
      final incidents = await _repository.fetchTimeline();
      state = AsyncValue.data(incidents);
    } catch (error, stack) {
      state = AsyncValue.error(error, stack);
    }
  }

  /// Prepends a freshly-arrived incident (e.g. from an FCM push) without a
  /// full refetch, so the timeline updates instantly when an alert lands.
  void prepend(Incident incident) {
    final current = state.value;
    if (current == null) return;
    state = AsyncValue.data([incident, ...current]);
  }

  Future<void> acknowledge(String id) async {
    final updated = await _repository.acknowledge(id);
    final current = state.value;
    if (current == null) return;
    state = AsyncValue.data([
      for (final incident in current)
        if (incident.id == id) updated else incident,
    ]);
  }
}

final incidentControllerProvider =
    StateNotifierProvider<IncidentController, AsyncValue<List<Incident>>>(
  (ref) => IncidentController(ref.watch(incidentRepositoryProvider)),
);

/// Fetches a single incident by id for the detail screen — backed by the
/// already-loaded timeline when possible, falling back to a direct fetch.
final incidentByIdProvider =
    FutureProvider.family<Incident, String>((ref, id) async {
  final timeline = ref.watch(incidentControllerProvider).value;
  final cached = timeline?.where((i) => i.id == id).toList();
  if (cached != null && cached.isNotEmpty) return cached.first;
  return ref.watch(incidentRepositoryProvider).fetchById(id);
});
