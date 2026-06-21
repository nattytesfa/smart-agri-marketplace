// ignore_for_file: deprecated_member_use

import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class RoleSelectionScreen extends StatefulWidget {
  final String phone;
  final String token;

  const RoleSelectionScreen({
    super.key,
    required this.phone,
    required this.token,
  });

  @override
  State<RoleSelectionScreen> createState() => _RoleSelectionScreenState();
}

class _RoleSelectionScreenState extends State<RoleSelectionScreen> {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  String _selectedRole = 'farmer';
  String _selectedStorage = 'none';
  double _farmSize = 0.0;

  final TextEditingController _farmSizeController =
      TextEditingController(text: '0');
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _registerUser() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final baseUrl = dotenv.env['BACKEND_API_BASE_URL']!;
    try {
      final response = await _dio.post(
        '$baseUrl/api/auth/register',
        options: Options(
          headers: {
            'Authorization': 'Bearer ${widget.token}',
            'Content-Type': 'application/json',
          },
        ),
        data: {
          'phone_number': widget.phone,
          'fayda_id': 'FAYDA${DateTime.now().millisecondsSinceEpoch}',
          'role': _selectedRole,
          'storage_type': _selectedStorage,
          'farm_size_hectares': _farmSize,
        },
      );

      if (response.statusCode != 201) {
        throw 'Registration failed: ${response.data}';
      }

      final userId = response.data['user_id'];
      await _storage.write(key: 'user_id', value: userId);
      await _storage.write(key: 'user_role', value: _selectedRole);
      
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('✅ Registration complete!'),
            backgroundColor: Colors.green),
      );
      Navigator.pushReplacementNamed(context, '/home');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Choose Your Role'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.person_add,
              size: 60,
              color: Colors.green,
            ),
            const SizedBox(height: 16),
            const Text(
              'How will you use the platform?',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 24),

            // Role cards
            Card(
              elevation: 2,
              child: Column(
                children: [
                  ListTile(
                    leading: Radio<String>(
                      value: 'farmer',
                      groupValue: _selectedRole,
                      onChanged: (value) =>
                          setState(() => _selectedRole = value!),
                      activeColor: Colors.green,
                    ),
                    title: const Text('👨‍🌾 Farmer'),
                    subtitle: const Text('Sell your produce to buyers'),
                    onTap: () => setState(() => _selectedRole = 'farmer'),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: Radio<String>(
                      value: 'buyer',
                      groupValue: _selectedRole,
                      onChanged: (value) =>
                          setState(() => _selectedRole = value!),
                      activeColor: Colors.green,
                    ),
                    title: const Text('🛒 Buyer'),
                    subtitle: const Text('Buy produce in bulk'),
                    onTap: () => setState(() => _selectedRole = 'buyer'),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Farmer-specific fields (only show when farmer is selected)
            if (_selectedRole == 'farmer') ...[
              const Text(
                'Farmer Details',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _selectedStorage,
                decoration: const InputDecoration(
                  labelText: 'Storage Type',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                      value: 'none', child: Text('None (Open Air)')),
                  DropdownMenuItem(
                      value: 'gotera', child: Text('Gotera (Traditional)')),
                  DropdownMenuItem(
                      value: 'modern', child: Text('Modern Storage')),
                ],
                onChanged: (value) => setState(() => _selectedStorage = value!),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _farmSizeController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Farm Size (hectares)',
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => setState(() {
                  _farmSize = double.tryParse(v) ?? 0.0;
                }),
              ),
            ],

            const SizedBox(height: 24),

            if (_errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  _errorMessage!,
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              ),

            ElevatedButton(
              onPressed: _isLoading ? null : _registerUser,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                padding: const EdgeInsets.symmetric(vertical: 16),
                minimumSize: const Size(double.infinity, 0),
              ),
              child: _isLoading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text(
                      'Complete Registration',
                      style: TextStyle(fontSize: 18, color: Colors.white),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
