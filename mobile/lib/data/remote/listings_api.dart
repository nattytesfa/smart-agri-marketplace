import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

String get listingApiBase {
  final base = (dotenv.env['BACKEND_API_BASE_URL'] ?? '')
      .replaceFirst(RegExp(r'/+$'), '');
  return base.endsWith('/api') ? base : '$base/api';
}

Dio listingApi() {
  final dio = Dio(BaseOptions(
      baseUrl: listingApiBase,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      sendTimeout: const Duration(seconds: 30)));
  dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
    final token = Supabase.instance.client.auth.currentSession?.accessToken;
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }));
  return dio;
}
