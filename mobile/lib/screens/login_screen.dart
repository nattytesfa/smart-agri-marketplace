import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../widgets/otp_input_field.dart';
import 'phone_validation.dart';
import 'role_selection_screen.dart'; // We'll create this next

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 20, color: Colors.red.shade700),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: Colors.red.shade900, fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _phoneController = TextEditingController();
  final _otpKey = GlobalKey<OtpInputFieldState>();
  final _storage = const FlutterSecureStorage();

  static const _otpLength = 6;
  static const _resendCooldown = Duration(seconds: 60);

  bool _isLoading = false;
  bool _otpSent = false;
  String? _errorMessage;

  Timer? _cooldownTimer;
  int _secondsToResend = 0;

  bool get _canResend => _secondsToResend == 0;

  @override
  void initState() {
    super.initState();
    _redirectIfSignedIn();
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    _phoneController.dispose();
    super.dispose();
  }

  // A valid session means the user is already signed in, so there is nothing
  // to do here. Guards against landing on /login after a token refresh, and
  // against back-navigation once authenticated.
  void _redirectIfSignedIn() {
    if (Supabase.instance.client.auth.currentSession == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, '/home');
    });
  }

  // Normalize local input (09..., 9..., +2519...) to E.164 (+2519...)
  String? _normalizePhone(String raw) => normalizeEthiopianPhone(raw);

  void _startCooldown() {
    _cooldownTimer?.cancel();
    setState(() => _secondsToResend = _resendCooldown.inSeconds);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => _secondsToResend--);
      if (_secondsToResend <= 0) {
        timer.cancel();
        _secondsToResend = 0;
      }
    });
  }

  // Send OTP
  Future<void> _sendOTP() async {
    final phone = _normalizePhone(_phoneController.text.trim());
    if (phone == null) {
      setState(() => _errorMessage =
          'Enter a valid Ethiopian phone number, e.g. 0912345678');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await Supabase.instance.client.auth.signInWithOtp(
        phone: phone,
      );

      if (!mounted) return;
      setState(() {
        _otpSent = true;
        _isLoading = false;
        _phoneController.text = phone;
      });
      _startCooldown();
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = _friendlyAuthError(e.message);
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Could not send the code. Please try again.';
        _isLoading = false;
      });
      debugPrint('sendOTP error: $e');
    }
  }

  // Resend an OTP for the number already in the field
  Future<void> _resendOTP() async {
    if (!_canResend) return;

    final phone = _normalizePhone(_phoneController.text.trim());
    if (phone == null) {
      setState(() => _errorMessage =
          'Enter a valid Ethiopian phone number, e.g. 0912345678');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await Supabase.instance.client.auth.resend(
        phone: phone,
        type: OtpType.sms,
      );

      if (!mounted) return;
      setState(() => _isLoading = false);
      _startCooldown();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('A new code was sent to $phone')),
      );
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = _friendlyAuthError(e.message);
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      debugPrint('resendOTP error: $e');
      setState(() {
        _errorMessage = 'Could not resend the code. Please try again.';
        _isLoading = false;
      });
    }
  }

  String _friendlyAuthError(String message) {
    final lower = message.toLowerCase();
    if (lower.contains('rate limit') ||
        lower.contains('too many') ||
        lower.contains('security')) {
      return 'Too many attempts. Please wait a few minutes before trying again.';
    }
    if (lower.contains('sms') || lower.contains('send')) {
      return 'We could not send the code. Please try again in a moment.';
    }
    return 'Could not send the code. Please try again.';
  }

  // Verify OTP. Invoked automatically once all digits are entered.
  Future<void> _verifyOTP(String otp) async {
    if (_isLoading || !_otpSent) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final phone = _phoneController.text.trim();

      final response = await Supabase.instance.client.auth.verifyOTP(
        phone: phone,
        token: otp,
        type: OtpType.sms,
      );

      if (!mounted) return;

      final token = response.session?.accessToken;
      if (token == null) {
        _otpKey.currentState?.reset();
        setState(() {
          _errorMessage = 'That code was not accepted. Please try again.';
          _isLoading = false;
        });
        return;
      }

      // Store token securely
      await _storage.write(key: 'supabase_token', value: token);

      // Store Supabase user ID as fallback
      final supabaseUser = response.session?.user;
      if (supabaseUser != null) {
        await _storage.write(key: 'user_id', value: supabaseUser.id);
      }

      // Check if user already exists in our database
      bool? existingUser;
      try {
        existingUser = await _checkExistingUser(token);
      } catch (e) {
        existingUser = null;
      }

      if (existingUser == true) {
        if (!mounted) return;
        setState(() => _isLoading = false);
        Navigator.pushReplacementNamed(context, '/home');
        return;
      }

      if (existingUser == false) {
        if (!mounted) return;
        setState(() => _isLoading = false);
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => RoleSelectionScreen(
              phone: phone,
              token: token,
            ),
          ),
        );
        return;
      }

      // Ambiguous (backend error other than 404) - do not assume existing user
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage =
            'We could not verify your account details. Please try again or register.';
      });
      try {
        await Supabase.instance.client.auth.signOut();
      } catch (_) {}
    } on AuthException catch (e) {
      if (!mounted) return;
      _otpKey.currentState?.reset();
      setState(() {
        _errorMessage = _verifyError(e.message);
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      debugPrint('verifyOTP error: $e');
      _otpKey.currentState?.reset();
      setState(() {
        _errorMessage = 'Something went wrong. Please try again.';
        _isLoading = false;
      });
    }
  }

  String _verifyError(String message) {
    final lower = message.toLowerCase();
    if (lower.contains('expired')) {
      return 'That code has expired. Tap "Resend code" to get a new one.';
    }
    if (lower.contains('rate limit') || lower.contains('too many')) {
      return 'Too many attempts. Please wait before trying again.';
    }
    if (lower.contains('invalid') || lower.contains('token')) {
      return 'That code is not correct. Please check and try again.';
    }
    return 'That code was not accepted. Please try again.';
  }

  // Check if user already exists in our local users table.
  // Returns true = registered, false = not registered, null = could not tell.
  Future<bool?> _checkExistingUser(String token) async {
    final dio = Dio();
    final rawUrl = dotenv.env['BACKEND_API_BASE_URL'] ?? '';
    final baseUrl =
        rawUrl.endsWith('/') ? rawUrl.substring(0, rawUrl.length - 1) : rawUrl;
    try {
      final response = await dio.get(
        '$baseUrl/api/auth/me',
        options: Options(
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
          },
          receiveTimeout: const Duration(seconds: 8),
          sendTimeout: const Duration(seconds: 8),
        ),
      );
      if (response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 300) {
        if (response.data != null && response.data is Map) {
          final data = response.data as Map;
          if (data['user_id'] != null) {
            await _storage.write(
                key: 'user_id', value: data['user_id'].toString());
          }
          if (data['role'] != null) {
            await _storage.write(
                key: 'user_role', value: data['role'].toString());
          }
        }
        return true;
      }
      return null;
    } on DioException catch (e) {
      // 404 is the only definitive "not registered" signal
      if (e.response?.statusCode == 404) {
        return false;
      }
      debugPrint('checkExistingUser failed: ${e.message}');
      return null;
    } catch (e) {
      debugPrint('checkExistingUser error: $e');
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Smart Agri Marketplace'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(
              Icons.agriculture,
              size: 80,
              color: Colors.green,
            ),
            const SizedBox(height: 16),
            const Text(
              'Welcome!',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Connect directly with farmers and buyers',
              style: TextStyle(fontSize: 16, color: Colors.grey),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            if (!_otpSent) ...[
              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                autofocus: true,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: 'Phone Number',
                  hintText: '0912 345 678',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.phone),
                ),
                onSubmitted: (_) => _sendOTP(),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _isLoading ? null : _sendOTP,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: _isLoading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        'Send OTP',
                        style: TextStyle(fontSize: 18, color: Colors.white),
                      ),
              ),
            ],
            if (_otpSent) ...[
              Row(
                children: [
                  const Icon(Icons.sms_outlined,
                      size: 18, color: Colors.green),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Code sent to ${_phoneController.text}',
                      style: const TextStyle(color: Colors.grey),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Enter the 6-digit code',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              OtpInputField(
                key: _otpKey,
                length: _otpLength,
                autofocus: true,
                enabled: !_isLoading,
                hasError: _errorMessage != null,
                onCompleted: _verifyOTP,
              ),
              if (_errorMessage != null) ...[
                const SizedBox(height: 16),
                _ErrorBanner(message: _errorMessage!),
              ],
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _isLoading ? null : () => _otpKey.currentState?.reset(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: _isLoading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        'Verify & Continue',
                        style: TextStyle(fontSize: 18, color: Colors.white),
                      ),
              ),
              Center(
                child: TextButton(
                  onPressed: _canResend && !_isLoading ? _resendOTP : null,
                  child: Text(_canResend
                      ? "Didn't get a code? Resend"
                      : "Resend available in ${_secondsToResend}s"),
                ),
              ),
              Center(
                child: TextButton.icon(
                  onPressed: _isLoading
                      ? null
                      : () {
                          _cooldownTimer?.cancel();
                          _otpKey.currentState?.reset();
                          setState(() {
                            _otpSent = false;
                            _secondsToResend = 0;
                            _errorMessage = null;
                          });
                        },
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('Change phone number'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
