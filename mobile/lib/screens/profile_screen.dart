import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _storage = const FlutterSecureStorage();
  String _phone = 'Unknown';
  String _role = 'Unknown';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadUserData();
  }

  Future<void> _loadUserData() async {
    final user = Supabase.instance.client.auth.currentUser;
    final phone = user?.phone ?? 'Unknown Phone';

    // Load role from secure storage
    final role = await _storage.read(key: 'user_role') ?? 'Unknown';

    setState(() {
      _phone = phone;
      _role = role;
      _isLoading = false;
    });
  }

  Future<void> _logout(BuildContext context) async {
    try {
      await Supabase.instance.client.auth.signOut();
      await _storage.delete(key: 'supabase_token');
      await _storage.delete(key: 'user_role');
      await _storage.delete(key: 'user_id');

      if (context.mounted) {
        Navigator.pushReplacementNamed(context, '/login');
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error logging out: $error')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Center(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Avatar
                    CircleAvatar(
                      radius: 60,
                      backgroundColor: Colors.green.shade100,
                      child: Icon(
                        _getRoleIcon(_role),
                        size: 60,
                        color: Colors.green.shade700,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Role badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: _getRoleColor(_role).withOpacity(0.15),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: _getRoleColor(_role)),
                      ),
                      child: Text(
                        _role.toUpperCase(),
                        style: TextStyle(
                          color: _getRoleColor(_role),
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Phone number
                    Text(
                      'Logged in as:',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _phone,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 8),

                    // Role description
                    Text(
                      _getRoleDescription(_role),
                      style: TextStyle(color: Colors.grey[600], fontSize: 14),
                    ),
                    const SizedBox(height: 40),

                    // Logout button
                    ElevatedButton.icon(
                      onPressed: () => _logout(context),
                      icon: const Icon(Icons.logout),
                      label: const Text('Logout'),
                      style: ElevatedButton.styleFrom(
                        foregroundColor: Colors.white,
                        backgroundColor: Colors.red,
                        minimumSize: const Size(double.infinity, 50),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  // Helper: get icon based on role
  IconData _getRoleIcon(String role) {
    switch (role.toLowerCase()) {
      case 'farmer':
        return Icons.agriculture;
      case 'buyer':
        return Icons.shopping_cart;
      case 'da':
        return Icons.support_agent;
      default:
        return Icons.person;
    }
  }

  // Helper: get color based on role
  Color _getRoleColor(String role) {
    switch (role.toLowerCase()) {
      case 'farmer':
        return Colors.green;
      case 'buyer':
        return Colors.blue;
      case 'da':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  // Helper: get description based on role
  String _getRoleDescription(String role) {
    switch (role.toLowerCase()) {
      case 'farmer':
        return '👨‍🌾 Sell your produce to buyers';
      case 'buyer':
        return '🛒 Buy produce in bulk';
      case 'da':
        return '🤝 Support farmers and buyers';
      default:
        return 'User of the platform';
    }
  }
}
