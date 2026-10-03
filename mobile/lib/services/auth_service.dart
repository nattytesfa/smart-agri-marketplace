import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Shared auth calls for the login, OTP and registration screens.
///
/// All three steps run against the same Supabase phone OTP flow, so the
/// network and storage handling lives here rather than being duplicated per
/// screen.
class AuthService {
  AuthService({FlutterSecureStorage? storage, Dio? dio})
      : _storage = storage ?? const FlutterSecureStorage(),
        _dio = dio ?? Dio();

  final FlutterSecureStorage _storage;
  final Dio _dio;

  static const _kToken = 'supabase_token';
  static const _kUserId = 'user_id';
  static const _kRole = 'user_role';

  String get _baseUrl {
    final raw = dotenv.env['BACKEND_API_BASE_URL'] ?? '';
    return raw.endsWith('/') ? raw.substring(0, raw.length - 1) : raw;
  }

  // Send a login/registration code to [phone], which must already be in E.164.
  Future<void> sendOtp(String phone) async {
    await Supabase.instance.client.auth.signInWithOtp(phone: phone);
  }

  // Re-send a code. Separate from [sendOtp] so Supabase applies its own resend
  // rules rather than starting a new OTP request.
  Future<void> resendOtp(String phone) async {
    await Supabase.instance.client.auth.resend(phone: phone, type: OtpType.sms);
  }

  // Verify [otp] for [phone] and persist the resulting session.
  // Returns the access token.
  Future<String> verifyOtp(String phone, String otp) async {
    final response = await Supabase.instance.client.auth.verifyOTP(
      phone: phone,
      token: otp,
      type: OtpType.sms,
    );

    final session = response.session;
    if (session == null) {
      // verifyOTP resolves without a session when the code is rejected.
      throw const AuthFailure(
          'That code is not correct. Check the 6 digits and try again.');
    }

    await _storage.write(key: _kToken, value: session.accessToken);
    await _storage.write(key: _kUserId, value: session.user.id);

    return session.accessToken;
  }

  /// Whether this phone is already registered in the local `users` table.
  ///
  /// Returns true when registered, false on a definitive 404, and null when
  /// the backend could not be reached. Callers must not treat null as false:
  /// the session is still valid, it just is not known whether the user has
  /// completed registration.
  Future<bool?> isRegistered(String token) async {
    try {
      final response = await _dio.get(
        '$_baseUrl/api/auth/me',
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
          },
          receiveTimeout: const Duration(seconds: 8),
          sendTimeout: const Duration(seconds: 8),
        ),
      );

      final status = response.statusCode ?? 0;
      if (status >= 200 && status < 300) {
        final data = response.data;
        if (data is Map) {
          final userId = data['user_id'];
          final role = data['role'];
          if (userId != null) {
            await _storage.write(key: _kUserId, value: userId.toString());
          }
          if (role != null) {
            await _storage.write(key: _kRole, value: role.toString());
          }
        }
        return true;
      }
      return null;
    } on DioException catch (e) {
      // 404 is the only definitive "not registered" signal
      if (e.response?.statusCode == 404) return false;
      debugPrint('isRegistered failed: ${e.message}');
      return null;
    } catch (e) {
      debugPrint('isRegistered error: $e');
      return null;
    }
  }

  /// Whether [phone] (in E.164) already has an account.
  ///
  /// Used before the OTP is sent, so it cannot rely on a session. Returns null
  /// when the lookup could not be completed, which the caller must surface
  /// rather than read as "not registered": that would make the duplicate check
  /// pass silently whenever the backend is unreachable. The register endpoint
  /// still rejects duplicates with 409 as a backstop.
  Future<bool?> isPhoneRegistered(String phone) async {
    try {
      final response = await _dio.get(
        '$_baseUrl/api/auth/check-registration',
        queryParameters: {'phone_number': phone},
        options: Options(
          receiveTimeout: const Duration(seconds: 8),
          sendTimeout: const Duration(seconds: 8),
        ),
      );

      final data = response.data;
      if (data is Map && data['registered'] is bool) {
        return data['registered'] as bool;
      }
      debugPrint(
          'isPhoneRegistered: unexpected body ${response.statusCode} $data');
      return null;
    } on DioException catch (e) {
      debugPrint(
          'isPhoneRegistered failed against $_baseUrl: ${e.type} ${e.message}');
      return null;
    } catch (e) {
      debugPrint('isPhoneRegistered error: $e');
      return null;
    }
  }
}

/// An auth failure with a message safe to show to the user.
class AuthFailure implements Exception {
  const AuthFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

/// How long a code stays usable. Mirrors the Supabase project default, so it
/// needs to change if the project's OTP expiry is reconfigured.
const kOtpValidity = Duration(seconds: 60);

/// Why a code was rejected.
enum OtpErrorKind {
  /// The digits do not match the code that was sent.
  incorrect,

  /// The code is no longer valid and a new one has to be requested.
  expired,

  /// Too many attempts or sends in a short window.
  tooManyAttempts,

  /// Anything else.
  unknown,
}

/// The message shown for [kind].
String otpErrorMessage(OtpErrorKind kind) => switch (kind) {
      OtpErrorKind.incorrect =>
        'That code is not correct. Check the 6 digits and try again.',
      OtpErrorKind.expired =>
        'That code has expired. Tap Resend below to get a new one.',
      OtpErrorKind.tooManyAttempts =>
        'Too many attempts. Wait a few minutes before trying again.',
      OtpErrorKind.unknown => 'Something went wrong. Please try again.',
    };

/// Works out why a code was rejected.
///
/// Supabase answers a wrong code and an expired one identically
/// ("Token has expired or is invalid", code `otp_expired`), so the server
/// cannot tell them apart. [codeAge], the time since the code was sent, is what
/// separates a typo from a stale code.
OtpErrorKind classifyOtpError(Object error, {required Duration codeAge}) {
  final message = error is AuthException ? error.message : error.toString();
  final code = error is AuthException ? error.code ?? '' : '';
  final lower = message.toLowerCase();

  if (code.contains('rate_limit') ||
      lower.contains('rate limit') ||
      lower.contains('too many')) {
    return OtpErrorKind.tooManyAttempts;
  }

  final rejected = lower.contains('expired') ||
      lower.contains('invalid') ||
      lower.contains('not correct') ||
      code.contains('otp_expired') ||
      code.contains('token');
  if (rejected) {
    return codeAge >= kOtpValidity
        ? OtpErrorKind.expired
        : OtpErrorKind.incorrect;
  }

  return OtpErrorKind.unknown;
}

/// Turns a raw Supabase auth error into something actionable.
///
/// Named to avoid colliding with gotrue's own `AuthException`. Use
/// [classifyOtpError] for code verification, which can be more specific.
String readableAuthError(Object error) {
  final code = error is AuthException ? error.code ?? '' : '';
  final message = error is AuthException ? error.message : error.toString();
  final lower = message.toLowerCase();

  if (code.contains('rate_limit') ||
      lower.contains('rate limit') ||
      lower.contains('too many') ||
      lower.contains('security')) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }
  if (lower.contains('expired')) {
    return 'That code has expired. Request a new one and try again.';
  }
  if (lower.contains('sms') || lower.contains('send')) {
    return 'We could not send the code. Please try again in a moment.';
  }
  if (lower.contains('invalid') ||
      lower.contains('token') ||
      lower.contains('not found')) {
    return 'That code is not correct. Please check and try again.';
  }
  return 'Something went wrong. Please try again.';
}
