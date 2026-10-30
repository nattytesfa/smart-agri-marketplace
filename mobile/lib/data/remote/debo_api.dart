import 'package:dio/dio.dart';
import 'listings_api.dart';

String deboError(Object error) => error is DioException
    ? (error.response?.data is Map
            ? error.response?.data['error']?.toString()
            : null) ??
        'Cannot reach the server. Check your connection and retry.'
    : error.toString().replaceFirst('Exception: ', '');

class DeboApi {
  Future<List<Map<String, dynamic>>> batches() async =>
      ((await listingApi().get('/debo/batches')).data as List)
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
  Future<Map<String, dynamic>> detail(String id) async =>
      Map<String, dynamic>.from(
          (await listingApi().get('/debo/batches/$id')).data);
  Future<Map<String, dynamic>> preview(Map<String, dynamic> data) async =>
      Map<String, dynamic>.from(
          (await listingApi().post('/debo/aggregate', data: data)).data);
  Future<Map<String, dynamic>> create(Map<String, dynamic> data) async =>
      Map<String, dynamic>.from(
          (await listingApi().post('/debo/batches', data: data)).data);
  Future<void> respond(
      String id, String listing, String action, double quantity) async {
    final response = await listingApi().post(
        '/debo/batches/$id/contributions/$listing/respond',
        data: {'action': action, 'quantity': quantity});
    if (action == 'accepted' &&
        !(response.data['listings'] as List).any((l) =>
            l['listing_id'] == listing &&
            l['reservation_status'] == 'active')) {
      throw Exception(
          'Reservation is no longer active. Refresh batch progress.');
    }
  }

  Future<void> cancel(String id) async {
    await listingApi().post('/debo/batches/$id/cancel');
  }

  Future<void> refresh(String id) async {
    await listingApi().post('/debo/batches/$id/refresh');
  }
}

double deboNumber(dynamic value) => double.tryParse('$value') ?? 0;
String deboQuantity(dynamic value) =>
    double.parse(deboNumber(value).toStringAsPrecision(15))
        .toString()
        .replaceFirst(RegExp(r'\.0$'), '');
