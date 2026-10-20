import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/auth_service.dart';
import '../widgets/auth_page.dart';
import '../widgets/error_banner.dart';
import 'otp_screen.dart';
import 'phone_validation.dart';

/// Sign-in entry point: collect a phone number and send an OTP.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.authService});

  /// Overridable so tests can drive the pre-send lookup.
  final AuthService? authService;

  @override
  LoginScreenState createState() => LoginScreenState();
}

/// Public so layout tests can drive the screen without touching the network.
class LoginScreenState extends State<LoginScreen> {
  final TextEditingController _phoneController = TextEditingController();
  late final AuthService _auth = widget.authService ?? AuthService();

  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _redirectIfSignedIn();
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  /// A valid session means the user is already signed in, so there is nothing
  /// to do here. Guards against landing on /login after a token refresh, and
  /// against back-navigation once authenticated.
  void _redirectIfSignedIn() {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      // Only a finished account skips this screen. A session left behind by an
      // abandoned registration is thrown away here, so signing in starts from
      // scratch instead of resuming halfway through something.
      //
      // This is a re-check of a session this screen does not own, so it gets a
      // single attempt: if the backend cannot be reached the user simply stays
      // on the sign-in form rather than being signed out on a slow answer.
      final gate = await sessionGateFor(
        session.accessToken,
        auth: _auth,
        attempts: 1,
      );
      if (!mounted || gate != SessionGate.open) return;
      Navigator.pushReplacementNamed(context, '/home');
    });
  }

  Future<void> _sendOtp() async {
    final phone = normalizeEthiopianPhone(_phoneController.text.trim());
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
      // Signing in with a number that has no account wastes an SMS and leads
      // to a dead end, so ask the backend before sending. Stopping on an
      // inconclusive lookup is the safer of the two failures here: the other
      // option is texting numbers that are not registered.
      final registered = await _auth.isPhoneRegistered(phone);
      if (!mounted) return;
      if (registered == false) {
        setState(() {
          _isLoading = false;
          _errorMessage =
              'This number is not registered yet. Create an account first.';
        });
        return;
      }
      if (registered == null) {
        setState(() {
          _isLoading = false;
          _errorMessage =
              'Could not check this number. Check your connection and try again.';
        });
        return;
      }

      await _auth.sendOtp(phone);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (context) => OtpScreen(phone: phone),
        ),
      );
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _errorMessage = readableAuthError(e));
    } catch (e) {
      if (!mounted) return;
      debugPrint('sendOtp error: $e');
      setState(
          () => _errorMessage = 'Could not send the code. Please try again.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthPage(
      title: 'Smart Agri Marketplace',
      children: [
        const Icon(Icons.agriculture, size: 72, color: Colors.green),
        const SizedBox(height: 12),
        const Text(
          'Welcome back',
          style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        const Text(
          'Sign in to connect with farmers and buyers',
          style: TextStyle(fontSize: 15, color: Colors.grey),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 28),
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
          onSubmitted: (_) => _sendOtp(),
        ),
        const SizedBox(height: 16),
        AuthPrimaryButton(
          label: 'Send OTP',
          isLoading: _isLoading,
          onPressed: _sendOtp,
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _isLoading
              ? null
              : () => Navigator.pushNamed(context, '/register'),
          child: const Text(
            "New here? Create an account",
            style: TextStyle(color: Colors.green),
          ),
        ),
        if (_errorMessage != null) ...[
          const SizedBox(height: 16),
          ErrorBanner(message: _errorMessage!),
        ],
      ],
    );
  }
}
