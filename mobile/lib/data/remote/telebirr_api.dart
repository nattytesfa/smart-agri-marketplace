import 'package:dio/dio.dart';
import 'listings_api.dart';

class TelebirrApi {
  TelebirrApi({Dio? dio}) : _dio = dio ?? listingApi();
  final Dio _dio;
  static const path = '/wallet/telebirr-uat';
  Future<Map<String, dynamic>> capabilities() async =>
      Map<String, dynamic>.from((await _dio.get('$path/capabilities')).data);
  Future<Map<String, dynamic>> history(int offset) async =>
      Map<String, dynamic>.from((await _dio
              .get(path, queryParameters: {'offset': offset, 'limit': 25}))
          .data);
  Future<Map<String, dynamic>> create(String amount, String key) async =>
      Map<String, dynamic>.from((await _dio.post(path,
              data: {'amount': amount, 'idempotency_key': key},
              options: Options(receiveTimeout: const Duration(seconds: 40))))
          .data);
  Future<Map<String, dynamic>> verify(String id,
          {bool interactionEnded = false}) async =>
      Map<String, dynamic>.from((await _dio.post(
              '$path/$id/${interactionEnded ? 'sdk-complete' : 'verify'}'))
          .data);
}
