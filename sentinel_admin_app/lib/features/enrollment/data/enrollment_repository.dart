library;

import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/services/api_client.dart';
import '../models/person_model.dart';

abstract class EnrollmentRepository {
  /// Uploads [photo] for [name]; the backend converts the face into a
  /// vector embedding and pushes it to the edge node's whitelist database.
  Future<EnrolledPerson> enrollPerson({
    required String name,
    required File photo,
  });

  Future<List<EnrolledPerson>> fetchEnrolled();
}

class MockEnrollmentRepository implements EnrollmentRepository {
  final List<EnrolledPerson> _people = [
    EnrolledPerson(
      id: 'person_01',
      name: 'J. Alvarez',
      enrolledAt: DateTime.now().subtract(const Duration(days: 12)),
      status: EnrollmentStatus.processed,
    ),
    EnrolledPerson(
      id: 'person_02',
      name: 'M. Chen',
      enrolledAt: DateTime.now().subtract(const Duration(days: 3)),
      status: EnrollmentStatus.processed,
    ),
  ];

  @override
  Future<EnrolledPerson> enrollPerson({
    required String name,
    required File photo,
  }) async {
    // Simulates the round trip: upload -> backend embedding -> push to edge.
    await Future.delayed(const Duration(seconds: 2));
    final person = EnrolledPerson(
      id: 'person_${(_people.length + 1).toString().padLeft(2, '0')}',
      name: name,
      enrolledAt: DateTime.now(),
      status: EnrollmentStatus.processed,
      thumbnailUrl: photo.path,
    );
    _people.add(person);
    return person;
  }

  @override
  Future<List<EnrolledPerson>> fetchEnrolled() async {
    await Future.delayed(const Duration(milliseconds: 300));
    return List.unmodifiable(_people);
  }
}

class RestEnrollmentRepository implements EnrollmentRepository {
  RestEnrollmentRepository(this._dio);
  final Dio _dio;

  @override
  Future<EnrolledPerson> enrollPerson({
    required String name,
    required File photo,
  }) async {
    final formData = FormData.fromMap({
      'name': name,
      'photo': await MultipartFile.fromFile(
        photo.path,
        filename: photo.uri.pathSegments.last,
      ),
    });

    final response = await _dio.post(
      ApiEndpoints.enrollPerson,
      data: formData,
    );

    final json = response.data as Map<String, dynamic>;
    return EnrolledPerson(
      id: json['id'] as String,
      name: json['name'] as String,
      enrolledAt: DateTime.parse(json['enrolled_at'] as String),
      status: EnrollmentStatus.values.byName(json['status'] as String),
      thumbnailUrl: json['thumbnail_url'] as String?,
    );
  }

  @override
  Future<List<EnrolledPerson>> fetchEnrolled() async {
    final response = await _dio.get(ApiEndpoints.enrollPerson);
    final list = response.data as List<dynamic>;
    return list.map((json) {
      final map = json as Map<String, dynamic>;
      return EnrolledPerson(
        id: map['id'] as String,
        name: map['name'] as String,
        enrolledAt: DateTime.parse(map['enrolled_at'] as String),
        status: EnrollmentStatus.values.byName(map['status'] as String),
        thumbnailUrl: map['thumbnail_url'] as String?,
      );
    }).toList();
  }
}

final enrollmentRepositoryProvider = Provider<EnrollmentRepository>((ref) {
  return MockEnrollmentRepository();
  // return RestEnrollmentRepository(ref.watch(apiClientProvider));
});
