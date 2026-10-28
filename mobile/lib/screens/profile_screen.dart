import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../features/auth/presentation/screens/fayda_verification_screen.dart';
import '../services/auth_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with WidgetsBindingObserver {
  final _storage = const FlutterSecureStorage();
  String _phone = 'Unknown';
  String _role = 'Unknown';
  bool _isLoading = true;

  /// Fayda identity verification state, persisted from the backend's answer
  /// on GET /api/auth/me. Null means the backend could not answer yet.
  String? _faydaId;
  bool? _faydaVerified;
  bool _verificationOpen = false;
  bool _refreshingFayda = false;
  Future<void>? _verificationRefresh;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadUserData();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _verificationOpen) {
      // Fetch while the verification screen is still visible. Back reuses
      // this same request rather than starting a second network round trip.
      _verificationRefresh ??= _refreshFaydaStatus();
    }
  }

  Future<void> _loadUserData() async {
    final user = Supabase.instance.client.auth.currentUser;
    final phone = user?.phone ?? 'Unknown Phone';

    // Load role and Fayda verification from secure storage
    final role = await _storage.read(key: 'user_role') ?? 'Unknown';
    final faydaId = await _storage.read(key: 'fayda_id');
    final faydaVerified = await _storage.read(key: 'fayda_verified');

    if (!mounted) return;
    setState(() {
      _phone = phone;
      _role = role;
      _faydaId = faydaId;
      _faydaVerified = faydaVerified == null ? null : faydaVerified == 'true';
      _isLoading = false;
    });
  }

  /// Sends the user through the external Fayda verification flow and, once
  /// they come back from the browser, refreshes the stored verification flag.
  Future<void> _startFaydaVerification() async {
    if (_phone == 'Unknown' || _phone == 'Unknown Phone') {
      return;
    }

    _verificationOpen = true;
    _verificationRefresh = null;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => FaydaVerificationScreen(
          phone: _phone,
          registrationData: const {},
          linkToProfile: true,
        ),
      ),
    );

    _verificationOpen = false;
    if (!mounted) return;
    await (_verificationRefresh ??= _refreshFaydaStatus());
  }

  /// Re-reads the backend profile so the Fayda flag reflects the flow that
  /// just completed in the browser, then re-reads the local mirror.
  Future<void> _refreshFaydaStatus() async {
    final token = AuthService.currentSessionToken;
    if (token == null) return;
    setState(() => _refreshingFayda = true);
    try {
      final refreshed = await AuthService().isRegistered(token);
      if (!mounted) return;
      if (refreshed != true) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Could not refresh verification status. Please try again.'),
        ));
      }
    } catch (e) {
      debugPrint('Fayda status refresh failed: $e');
    }
    try {
      if (mounted) await _loadUserData();
    } finally {
      if (mounted) setState(() => _refreshingFayda = false);
    }
  }

  Future<void> _logout(BuildContext context) async {
    try {
      await Supabase.instance.client.auth.signOut();

      // Clear local state even if signOut throws, otherwise the next launch
      // restores a session the user believes they ended.
      await _storage.delete(key: 'supabase_token');
      await _storage.delete(key: 'user_role');
      await _storage.delete(key: 'user_id');
      await _storage.delete(key: 'fayda_id');
      await _storage.delete(key: 'fayda_verified');

      if (!context.mounted) return;
      Navigator.pushNamedAndRemoveUntil(
        context,
        '/login',
        (route) => false,
      );
    } catch (error) {
      await _storage.delete(key: 'supabase_token');
      await _storage.delete(key: 'user_role');
      await _storage.delete(key: 'user_id');
      await _storage.delete(key: 'fayda_id');
      await _storage.delete(key: 'fayda_verified');
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error logging out: $error')),
      );
      Navigator.pushNamedAndRemoveUntil(
        context,
        '/login',
        (route) => false,
      );
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
          : LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight),
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
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
                            color: _getRoleColor(_role).withValues(),
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
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),

                        // Role description
                        Text(
                          _getRoleDescription(_role),
                          style: TextStyle(color: Colors.grey[600], fontSize: 14),
                        ),
                        const SizedBox(height: 24),

                        // Fayda verification status
                        _buildFaydaStatus(),
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
              ),
            ),
      );
  }

  /// Identity verification through Fayda: a green "verified" state with the
  /// Fayda ID, or a pending state with a shortcut into the verification flow.
  Widget _buildFaydaStatus() {
    final verified = _faydaVerified == true;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20.0),
      decoration: BoxDecoration(
        color: verified ? Colors.green.shade50 : Colors.amber.shade50,
        borderRadius: BorderRadius.circular(16.0),
        border: Border.all(
          color: verified ? Colors.green.shade400 : Colors.amber.shade400,
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Icon(
                verified ? Icons.verified_user : Icons.verified_outlined,
                color: verified ? Colors.green : Colors.amber.shade600,
                size: 28,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _refreshingFayda
                      ? 'Checking Fayda verification…'
                      : verified ? 'Fayda Verified' : 'Fayda Verification Pending',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: verified
                        ? Colors.green.shade700
                        : Colors.amber.shade700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            _refreshingFayda
                ? 'Confirming your latest verification status.'
                : verified
                ? 'Your identity was verified through Fayda.'
                : 'Verify your identity with Fayda to verify this profile.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey[700], fontSize: 13),
          ),
          if (verified && _faydaId != null && _faydaId!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'Fayda ID: $_faydaId',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
          ],
          if (!verified) ...[
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _refreshingFayda ? null : () => _startFaydaVerification(),
              icon: const Icon(Icons.verified_user, color: Colors.white),
              label: const Text('Verify with Fayda'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 48),
              ),
            ),
          ],
          if (_refreshingFayda) ...[
            const SizedBox(height: 12),
            const LinearProgressIndicator(),
          ],
        ],
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
