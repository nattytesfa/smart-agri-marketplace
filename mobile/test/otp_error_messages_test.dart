import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/services/auth_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// What gotrue returns for both a typo and a stale code.
const _rejectedCode = AuthException(
  'Token has expired or is invalid',
  statusCode: '403',
  code: 'otp_expired',
);

void main() {
  group('classifyOtpError', () {
    test('a fresh code that does not match is reported as incorrect', () {
      expect(
        classifyOtpError(_rejectedCode, codeAge: const Duration(seconds: 30)),
        OtpErrorKind.incorrect,
      );
    });

    test('a code older than its validity is reported as expired', () {
      expect(
        classifyOtpError(_rejectedCode,
            codeAge: kOtpValidity + const Duration(minutes: 1)),
        OtpErrorKind.expired,
      );
    });

    test('a code right on the expiry boundary counts as expired', () {
      expect(
        classifyOtpError(_rejectedCode, codeAge: kOtpValidity),
        OtpErrorKind.expired,
      );
    });

    test('rate limits are not mistaken for a bad code', () {
      const rateLimited = AuthException(
        'Too many requests',
        statusCode: '429',
        code: 'over_sms_send_rate_limit',
      );

      expect(
        classifyOtpError(rateLimited, codeAge: const Duration(seconds: 10)),
        OtpErrorKind.tooManyAttempts,
      );
    });

    test('an unrecognised error stays unknown', () {
      expect(
        classifyOtpError(
          const SocketException('network down'),
          codeAge: const Duration(seconds: 10),
        ),
        OtpErrorKind.unknown,
      );
    });

    test('a plain exception is classified rather than thrown', () {
      expect(
        classifyOtpError('Token has expired or is invalid',
            codeAge: const Duration(seconds: 5)),
        OtpErrorKind.incorrect,
      );
    });
  });

  group('otpErrorMessage', () {
    test('says the code is wrong rather than expired', () {
      expect(otpErrorMessage(OtpErrorKind.incorrect),
          'That code is not correct. Check the 6 digits and try again.');
    });

    test('points at Resend when the code has expired', () {
      expect(otpErrorMessage(OtpErrorKind.expired),
          'That code has expired. Tap Resend below to get a new one.');
    });

    test('has a distinct message for rate limits', () {
      expect(otpErrorMessage(OtpErrorKind.tooManyAttempts),
          contains('Too many attempts'));
    });

    test('every kind produces a non-empty message', () {
      for (final kind in OtpErrorKind.values) {
        expect(otpErrorMessage(kind), isNotEmpty);
      }
    });
  });
}
