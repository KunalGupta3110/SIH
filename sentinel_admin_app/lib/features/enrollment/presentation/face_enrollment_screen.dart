import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../controllers/enrollment_controller.dart';

class FaceEnrollmentScreen extends ConsumerWidget {
  const FaceEnrollmentScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final formState = ref.watch(enrollmentControllerProvider);
    final controller = ref.read(enrollmentControllerProvider.notifier);

    ref.listen(enrollmentControllerProvider, (previous, next) {
      if (next.status == SubmissionStatus.success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${next.name.isEmpty ? "Person" : next.name} enrolled successfully.'),
            backgroundColor: AppColors.safeGreen,
          ),
        );
      } else if (next.status == SubmissionStatus.failure && next.errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.errorMessage!),
            backgroundColor: AppColors.hazardRed,
          ),
        );
      }
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Enroll Authorized Person')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Capture a clear, front-facing photo. The cloud will convert it '
              'into a face vector and push it to the edge node\'s whitelist.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 24),
            _PhotoCapturePreview(
              photo: formState.photo,
              onCapture: controller.capturePhoto,
              onGallery: controller.pickFromGallery,
            ),
            const SizedBox(height: 28),
            Text('Full name', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            TextField(
              onChanged: controller.setName,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(hintText: 'e.g. Jordan Alvarez'),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: formState.canSubmit ? controller.submit : null,
                child: formState.status == SubmissionStatus.submitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.base,
                        ),
                      )
                    : const Text('Submit for Enrollment'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoCapturePreview extends StatelessWidget {
  const _PhotoCapturePreview({
    required this.photo,
    required this.onCapture,
    required this.onGallery,
  });

  final File? photo;
  final VoidCallback onCapture;
  final VoidCallback onGallery;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: AspectRatio(
            aspectRatio: 1,
            child: photo == null
                ? Container(
                    color: AppColors.surface,
                    child: const Center(
                      child: Icon(
                        Icons.person_outline_rounded,
                        size: 64,
                        color: AppColors.textDisabled,
                      ),
                    ),
                  )
                : Image.file(photo!, fit: BoxFit.cover),
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onCapture,
                icon: const Icon(Icons.camera_alt_outlined, size: 18),
                label: const Text('Take Photo'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onGallery,
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: const Text('Gallery'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
