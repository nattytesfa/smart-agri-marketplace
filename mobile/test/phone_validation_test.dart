import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/screens/phone_validation.dart';

void main() {
  group('normalizeEthiopianPhone', () {
    test('accepts local 09... format', () {
      expect(normalizeEthiopianPhone('0912345678'), '+251912345678');
    });

    test('accepts bare 9... format', () {
      expect(normalizeEthiopianPhone('912345678'), '+251912345678');
    });

    test('accepts already-normalized +251 format', () {
      expect(normalizeEthiopianPhone('+251912345678'), '+251912345678');
    });

    test('accepts 251 without the plus', () {
      expect(normalizeEthiopianPhone('251912345678'), '+251912345678');
    });

    test('accepts 00 international prefix', () {
      expect(normalizeEthiopianPhone('00251912345678'), '+251912345678');
    });

    test('ignores spaces, dashes and parentheses', () {
      expect(normalizeEthiopianPhone('0912 345 678'), '+251912345678');
      expect(normalizeEthiopianPhone('0912-345-678'), '+251912345678');
      expect(normalizeEthiopianPhone('(0912) 345-678'), '+251912345678');
    });

    test('rejects wrong length', () {
      expect(normalizeEthiopianPhone('091234567'), isNull);
      expect(normalizeEthiopianPhone('09123456789'), isNull);
    });

    test('rejects numbers not starting with 9', () {
      expect(normalizeEthiopianPhone('0812345678'), isNull);
      expect(normalizeEthiopianPhone('0712345678'), isNull);
    });

    test('rejects non-digits and empty input', () {
      expect(normalizeEthiopianPhone(''), isNull);
      expect(normalizeEthiopianPhone('0912abc678'), isNull);
    });

    test('rejects a different country prefix', () {
      expect(normalizeEthiopianPhone('+12025550123'), isNull);
    });
  });
}
