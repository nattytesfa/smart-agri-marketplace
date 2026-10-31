import 'package:dio/dio.dart';
import 'listings_api.dart';

class WalletApi {
  WalletApi({Dio? dio}) : _dio = dio ?? listingApi();
  final Dio _dio;
  Future<Map<String, dynamic>> summary() async =>
      Map<String, dynamic>.from((await _dio.get('/wallet')).data);
  Future<Map<String, dynamic>> history(int offset) async =>
      Map<String, dynamic>.from((await _dio.get('/wallet/history',
              queryParameters: {'offset': offset, 'limit': 25}))
          .data);
  Future<Map<String, dynamic>> quote(String id) async =>
      Map<String, dynamic>.from((await _dio.get('/wallet/checkouts/$id')).data);
  Future<Map<String, dynamic>> topUp(String amount, String key) async =>
      Map<String, dynamic>.from((await _dio.post('/wallet/top-ups', data: {
        'amount': amount,
        'idempotency_key': key,
        'confirm_demo': true,
      }))
          .data);
}
