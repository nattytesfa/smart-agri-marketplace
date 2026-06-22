import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'role_selection_screen.dart'; // We'll create this next

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _otpController = TextEditingController();
  final _storage = const FlutterSecureStorage();

  bool _isLoading = false;
  bool _otpSent = false;
  String? _errorMessage;

  // Send OTP
  Future<void> _sendOTP() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final phone = _phoneController.text.trim();
      if (!phone.startsWith('+251')) {
        throw 'Phone number must start with +251';
      }

      await Supabase.instance.client.auth.signInWithOtp(
        phone: phone,
      );

      if (!mounted) return;
      setState(() {
        _otpSent = true;
        _isLoading = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('OTP sent to your phone!')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  // Verify OTP
  Future<void> _verifyOTP() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final phone = _phoneController.text.trim();
      final otp = _otpController.text.trim();

      final response = await Supabase.instance.client.auth.verifyOTP(
        phone: phone,
        token: otp,
        type: OtpType.sms,
      );

      if (!mounted) return;

      final token = response.session?.accessToken;
      if (token == null) throw 'Failed to get access token';

      // Store token securely
      await _storage.write(key: 'supabase_token', value: token);

      // Check if user already exists in our database
      final existingUser = await _checkExistingUser(token);
      if (existingUser == true) {
        // User already registered → go directly to home
        if (!mounted) return;
        Navigator.pushReplacementNamed(context, '/home');
        return;
      }

      // New user → navigate to role selection
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (context) => RoleSelectionScreen(
            phone: phone,
            token: token,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  // Check if user already exists in our local users table
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
      return false;
    } on DioException catch (e) {
      // If 404, user doesn't exist yet
      if (e.response?.statusCode == 404) {
        return false;
      }
      throw 'Connection error: ${e.message}';
    } catch (e) {
      throw 'Unexpected error: $e';
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
                decoration: const InputDecoration(
                  labelText: 'Phone Number',
                  hintText: '+251',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.phone),
                ),
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
              TextField(
                controller: _otpController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Enter OTP',
                  hintText: '123456',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.lock),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _isLoading ? null : _verifyOTP,
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
              TextButton(
                onPressed: () {
                  setState(() {
                    _otpSent = false;
                    _otpController.clear();
                  });
                },
                child: const Text('Back to phone number'),
              ),
            ],
            if (_errorMessage != null) ...[
              const SizedBox(height: 16),
              Text(
                _errorMessage!,
                style: const TextStyle(color: Colors.red),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
