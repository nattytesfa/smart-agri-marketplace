import 'dart:convert';

/// The identifiers route a scan; only the backend validates the opaque token.
class DeliveryQr {
  const DeliveryQr(this.transactionId, this.allocationId, this.token);
  final String transactionId, allocationId, token;
  String encode() => jsonEncode({
        'v': 1,
        'transaction_id': transactionId,
        'allocation_id': allocationId,
        'token': token
      });
  static DeliveryQr parse(String text,
      {String? transactionId, String? allocationId}) {
    final value = jsonDecode(text);
    final uuid =
        RegExp(r'^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$');
    if (value is! Map ||
        value['v'] != 1 ||
        value['transaction_id'] is! String ||
        value['allocation_id'] is! String ||
        value['token'] is! String ||
        !uuid.hasMatch(value['transaction_id']) ||
        !uuid.hasMatch(value['allocation_id']) ||
        !RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(value['token']) ||
        (transactionId != null && value['transaction_id'] != transactionId) ||
        (allocationId != null && value['allocation_id'] != allocationId)) {
      throw const FormatException('Invalid delivery QR or wrong allocation');
    }
    return DeliveryQr(
        value['transaction_id'], value['allocation_id'], value['token']);
  }
}
