import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/features/traceability_qr/delivery_qr.dart';

void main() {
  const transaction = '11111111-1111-4111-8111-111111111111';
  const allocation = '22222222-2222-4222-8222-222222222222';
  final token = '${'a' * 40}_-b';
  test('QR round trip preserves underscores in opaque tokens', () {
    final qr = DeliveryQr.parse(
        DeliveryQr(transaction, allocation, token).encode(),
        transactionId: transaction,
        allocationId: allocation);
    expect(qr.token, token);
    expect(qr.allocationId, allocation);
  });
  test('scanner rejects wrong allocation before asking for confirmation', () {
    expect(
        () => DeliveryQr.parse(
            DeliveryQr(transaction, allocation, token).encode(),
            allocationId: transaction),
        throwsFormatException);
  });
  test('malformed, legacy, missing and empty token QR codes are rejected', () {
    for (final text in [
      'txn_fake_token',
      '{}',
      '[]',
      DeliveryQr(transaction, allocation, '').encode(),
      DeliveryQr('not-an-id', allocation, token).encode()
    ]) {
      expect(() => DeliveryQr.parse(text), throwsFormatException);
    }
  });
}
