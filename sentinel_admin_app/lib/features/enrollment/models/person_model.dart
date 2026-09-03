import 'package:equatable/equatable.dart';

enum EnrollmentStatus { pending, processed, failed }

class EnrolledPerson extends Equatable {
  const EnrolledPerson({
    required this.id,
    required this.name,
    required this.enrolledAt,
    required this.status,
    this.thumbnailUrl,
  });

  final String id;
  final String name;
  final DateTime enrolledAt;
  final EnrollmentStatus status;
  final String? thumbnailUrl;

  @override
  List<Object?> get props => [id, name, enrolledAt, status, thumbnailUrl];
}
