// Thin wrapper around dio so every repository shares one configured client
// (base URL, timeouts, auth header injection, logging interceptor).
// Repositories depend on [apiClientProvider] rather than constructing their
// own Dio instance — this is the single seam to add auth refresh, retry,
// or request signing later without touching feature code.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/app_constants.dart';

final apiClientProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: AppConfig.connectTimeout,
      receiveTimeout: AppConfig.receiveTimeout,
      headers: {'Content-Type': 'application/json'},
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        // TODO: inject the signed-in admin's bearer token here, e.g.
        // options.headers['Authorization'] = 'Bearer ${ref.read(authTokenProvider)}';
        handler.next(options);
      },
      onError: (error, handler) {
        // Centralized place to surface auth expiry / connectivity errors
        // to a global error stream if needed later.
        handler.next(error);
      },
    ),
  );

  return dio;
});
