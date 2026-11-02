import 'package:dio/dio.dart';
import 'listings_api.dart';

/// Internal application simulation. Never calls the provider or Android SDK.
class TelebirrDemoApi {
  TelebirrDemoApi({Dio? dio}) : _dio = dio ?? listingApi();
  final Dio _dio;
  static const path = '/wallet/telebirr-demo/payments';
  Future<Map<String, dynamic>> create(String amount, String key) async =>
      Map<String, dynamic>.from((await _dio.post(path, data: {
        'amount': amount,
        'idempotency_key': key,
        'confirm_demo': true,
      }))
          .data);
  Future<Map<String, dynamic>> get(String id) async =>
      Map<String, dynamic>.from((await _dio.get('$path/$id')).data);
  Future<Map<String, dynamic>> act(
          String id, String action, String amount) async =>
      Map<String, dynamic>.from((await _dio.post('$path/$id/$action', data: {
        'amount': amount,
        'confirm_demo': true,
      }))
          .data);
  Future<List<Map<String, dynamic>>> history() async =>
      List<Map<String, dynamic>>.from((await _dio.get(path)).data['items']);
}
