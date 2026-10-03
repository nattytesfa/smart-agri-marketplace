import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/models/registration_draft.dart';
import '../services/auth_service.dart';
import '../widgets/auth_page.dart';
import '../widgets/error_banner.dart';
import '../widgets/otp_input_field.dart';
import 'role_selection_screen.dart';

/// OTP entry and verification, shared by sign-in and registration.
///
/// On success the session is persisted, then the user is routed: to role
/// selection when [isRegistration] is set or when the backend reports no
/// account, otherwise to the home screen.
class OtpScreen extends StatefulWidget {
  const OtpScreen({
    super.key,
    required this.phone,
    this.isRegistration = false,
    this.draft,
  });

  /// Phone number in E.164, as supplied by the preceding screen.
  final String phone;

  /// Skip the "already registered?" check and continue to role selection.
  final bool isRegistration;

  /// Details collected on the registration screen, forwarded to the register
  /// endpoint. Required when [isRegistration] is set.
  final RegistrationDraft? draft;

  @override
  OtpScreenState createState() => OtpScreenState();
}

class OtpScreenState extends State<OtpScreen> {
  final _otpKey = GlobalKey<OtpInputFieldState>();
  final _auth = AuthService();

  static const _otpLength = 6;
  static const _resendCooldown = Duration(seconds: 60);

  bool _isLoading = false;
  String? _errorMessage;

  Timer? _cooldownTimer;
  int _secondsToResend = 0;

  /// When the current code was sent. Supabase reports a wrong code and an
  /// expired one identically, so this is what tells them apart.
  DateTime _codeSentAt = DateTime.now();

  bool get _canResend => _secondsToResend == 0;

  @override
  void initState() {
    super.initState();
    // The code was just sent by the preceding screen, so the wait starts here.
    _startCooldown();
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    super.dispose();
  }

  void _startCooldown() {
    _cooldownTimer?.cancel();
    _secondsToResend = _resendCooldown.inSeconds;
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

  Future<void> _resend() async {
    if (!_canResend) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await _auth.resendOtp(widget.phone);
      if (!mounted) return;
      _codeSentAt = DateTime.now();
      _startCooldown();
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = readableAuthError(e));
    } catch (e) {
      if (!mounted) return;
      debugPrint('resend error: $e');
      setState(
          () => _errorMessage = 'Could not resend the code. Please try again.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // Invoked automatically once all digits are entered.
  Future<void> _verify(String otp) async {
    if (_isLoading) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final token = await _auth.verifyOtp(widget.phone, otp);
      if (!mounted) return;

      // Explicit registration intent wins: the backend answers 409 if the
      // phone is already registered, and RoleSelectionScreen surfaces that.
      if (widget.isRegistration) {
        return _goToRoleSelection(token);
      }

      bool? registered;
      try {
        registered = await _auth.isRegistered(token);
      } catch (e) {
        registered = null;
      }

      if (!mounted) return;

      // A returning user on the sign-in screen has no draft on file, so send
      // them back to the register screen rather than submitting an empty one.
      if (registered == false && widget.draft != null) {
        return _goToRoleSelection(token);
      }

      // registered == true, or the check was inconclusive (usually the backend
      // is unreachable). The OTP verified, so the session is valid and there
      // is nothing to re-authenticate. Do NOT sign out here: that discards a
      // good session and bounces the user back to the phone number step.
      if (registered == null) {
        debugPrint('registration check inconclusive, continuing to home');
      }
      setState(() => _isLoading = false);
      Navigator.pushReplacementNamed(context, '/home');
    } on AuthFailure catch (e) {
      if (!mounted) return;
      _otpKey.currentState?.reset();
      setState(() => _errorMessage = e.message);
    } on AuthException catch (e) {
      if (!mounted) return;
      _otpKey.currentState?.reset();
      _showOtpError(classifyOtpError(
        e,
        codeAge: DateTime.now().difference(_codeSentAt),
      ));
    } catch (e) {
      if (!mounted) return;
      debugPrint('verify error: $e');
      _otpKey.currentState?.reset();
      setState(() => _errorMessage = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // A wrong code and an expired one come back from Supabase as the same error,
  // so [kind] is derived from how long ago the code was sent. An expired code
  // also unlocks Resend, since waiting out the cooldown would be pointless.
  void _showOtpError(OtpErrorKind kind) {
    if (kind == OtpErrorKind.expired) {
      _cooldownTimer?.cancel();
      _secondsToResend = 0;
    }
    setState(() => _errorMessage = otpErrorMessage(kind));
  }

  void _goToRoleSelection(String token) {
    setState(() => _isLoading = false);
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (context) => RoleSelectionScreen(
          phone: widget.phone,
          token: token,
          draft: widget.draft,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AuthPage(
      title: 'Verify your phone',
      children: [
        Row(
          children: [
            const Icon(Icons.sms_outlined, size: 18, color: Colors.green),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Code sent to ${widget.phone}',
                style: const TextStyle(color: Colors.grey),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        const Align(
          alignment: Alignment.centerLeft,
          child: Text(
            'Enter the $_otpLength-digit code',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(height: 16),
        OtpInputField(
          key: _otpKey,
          length: _otpLength,
          autofocus: true,
          enabled: !_isLoading,
          hasError: _errorMessage != null,
          onCompleted: _verify,
        ),
        if (_errorMessage != null) ...[
          const SizedBox(height: 16),
          ErrorBanner(message: _errorMessage!),
        ],
        const SizedBox(height: 24),
        AuthPrimaryButton(
          label: 'Verify & Continue',
          isLoading: _isLoading,
          onPressed: () => _otpKey.currentState?.reset(),
        ),
        Center(
          child: TextButton(
            onPressed: _canResend && !_isLoading ? _resend : null,
            child: Text(
              _canResend
                  ? "Didn't get a code? Resend"
                  : "Resend available in ${_secondsToResend}s",
            ),
          ),
        ),
        Center(
          child: TextButton.icon(
            onPressed: _isLoading
                ? null
                : () => Navigator.pushReplacementNamed(
                      context,
                      widget.isRegistration ? '/register' : '/login',
                    ),
            icon: const Icon(Icons.edit_outlined, size: 16),
            label: const Text('Change phone number'),
          ),
        ),
      ],
    );
  }
}
