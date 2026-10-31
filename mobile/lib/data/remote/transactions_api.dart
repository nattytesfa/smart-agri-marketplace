import 'package:dio/dio.dart';
import 'listings_api.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class TransactionsApi {
  TransactionsApi({Dio? dio}) : _dio = dio ?? listingApi();
  final Dio _dio;
  String? get currentUserId => Supabase.instance.client.auth.currentUser?.id;
  Future<Map<String, dynamic>> account() async =>
      Map<String, dynamic>.from((await _dio.get('/auth/me')).data);
  Future<List<Map<String, dynamic>>> list() async =>
      List<Map<String, dynamic>>.from((await _dio.get('/transactions')).data);
  Future<Map<String, dynamic>> get(String id) async =>
      Map<String, dynamic>.from((await _dio.get('/transactions/$id')).data);
  Future<Map<String, dynamic>> initiate(Map<String, dynamic> data) async {
    final user = await account();
    if (user['role'] != 'buyer') {
      throw AccountAccessException(
          'This account is registered as ${user['role']}. Checkout requires a buyer account. Sign out and sign in with your buyer account, or register a different account as a buyer.');
    }
    return Map<String, dynamic>.from(
        (await _dio.post('/transactions/initiate', data: data))
            .data['transaction']);
  }

  Future<void> action(String id, String action,
      [Map<String, dynamic>? data]) async {
    await _dio.post('/transactions/$id/$action', data: data ?? {});
  }

  Future<Map<String, dynamic>> qr(String id, String allocation) async =>
      Map<String, dynamic>.from(
          (await _dio.post('/transactions/$id/allocations/$allocation/qr'))
              .data);
  static String error(Object error) => error is DioException
      ? (error.response?.data is Map
          ? (error.response?.data['error'] ?? 'Request failed').toString()
          : 'Network unavailable. Refresh your order before retrying.')
      : error.toString();
}

class AccountAccessException implements Exception {
  AccountAccessException(this.message);
  final String message;
  @override
  String toString() => message;
}
