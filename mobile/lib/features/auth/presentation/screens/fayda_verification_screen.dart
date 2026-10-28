import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../services/auth_service.dart';

class FaydaVerificationScreen extends StatefulWidget {
  final String phone;
  final Map<String, dynamic> registrationData;
  final bool linkToProfile;

  const FaydaVerificationScreen({
    super.key,
    required this.phone,
    required this.registrationData,
    this.linkToProfile = false,
  });

  @override
  State<FaydaVerificationScreen> createState() =>
      _FaydaVerificationScreenState();
}

class _FaydaVerificationScreenState extends State<FaydaVerificationScreen> {
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startFaydaFlow();
  }

  Future<void> _startFaydaFlow() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    final baseUrl =
        dotenv.env['FAYDA_BROWSER_BASE_URL'] ??
        dotenv.env['BACKEND_API_BASE_URL'] ?? 'http://localhost:4000';
    final authUrl = '$baseUrl/api/auth/fayda/login';
    try {
      var uri = Uri.parse(authUrl);
      if (widget.linkToProfile) {
        final token = AuthService.currentSessionToken;
        if (token == null) {
          throw const AuthFailure('Please sign in again to verify your profile.');
        }
        final ticket = await AuthService().startFaydaVerification(token);
        uri = uri.replace(queryParameters: {'ticket': ticket});
      }
      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!mounted) return;
      if (launched) {
        setState(() {
          _isLoading = false;
        });
      } else {
        setState(() {
          _error = 'Could not launch Fayda verification';
          _isLoading = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is AuthFailure ? e.message : 'Could not start Fayda verification. Check your connection and try again.';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Fayda Verification'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: _isLoading
            ? const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Redirecting to Fayda verification...'),
                ],
              )
            : _error != null
                ? Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error, color: Colors.red, size: 48),
                        const SizedBox(height: 16),
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _startFaydaFlow,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.check_circle_outline,
                            color: Colors.green, size: 48),
                        const SizedBox(height: 16),
                        const Text(
                          'Fayda verification started in your browser',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 18),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'After completing verification, return to the app and tap Back to refresh your profile. If the browser reports an error, verification was not completed.',
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: () {
                            Navigator.pop(context);
                          },
                          child: const Text('Back'),
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }
}
