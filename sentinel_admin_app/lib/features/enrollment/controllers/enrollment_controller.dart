library;

import 'dart:io';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../data/enrollment_repository.dart';

enum SubmissionStatus { idle, submitting, success, failure }

class EnrollmentFormState extends Equatable {
  const EnrollmentFormState({
    this.name = '',
    this.photo,
    this.status = SubmissionStatus.idle,
    this.errorMessage,
  });

  final String name;
  final File? photo;
  final SubmissionStatus status;
  final String? errorMessage;

  bool get canSubmit =>
      name.trim().isNotEmpty &&
      photo != null &&
      status != SubmissionStatus.submitting;

  EnrollmentFormState copyWith({
    String? name,
    File? photo,
    SubmissionStatus? status,
    String? errorMessage,
  }) {
    return EnrollmentFormState(
      name: name ?? this.name,
      photo: photo ?? this.photo,
      status: status ?? this.status,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [name, photo, status, errorMessage];
}

class EnrollmentController extends StateNotifier<EnrollmentFormState> {
  EnrollmentController(this._repository) : super(const EnrollmentFormState());

  final EnrollmentRepository _repository;
  final ImagePicker _picker = ImagePicker();

  void setName(String name) => state = state.copyWith(name: name);

  Future<void> capturePhoto() => _pickImage(ImageSource.camera);
  Future<void> pickFromGallery() => _pickImage(ImageSource.gallery);

  Future<void> _pickImage(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      maxWidth: 1600,
      imageQuality: 90,
      preferredCameraDevice: CameraDevice.front,
    );
    if (picked == null) return;
    state = state.copyWith(photo: File(picked.path));
  }

  Future<void> submit() async {
    if (!state.canSubmit) return;
    state = state.copyWith(status: SubmissionStatus.submitting);
    try {
      await _repository.enrollPerson(name: state.name.trim(), photo: state.photo!);
      state = const EnrollmentFormState(status: SubmissionStatus.success);
    } catch (e) {
      state = state.copyWith(
        status: SubmissionStatus.failure,
        errorMessage: 'Could not enroll this person. Check your connection and try again.',
      );
    }
  }

  void reset() => state = const EnrollmentFormState();
}

final enrollmentControllerProvider =
    StateNotifierProvider.autoDispose<EnrollmentController, EnrollmentFormState>(
  (ref) => EnrollmentController(ref.watch(enrollmentRepositoryProvider)),
);
