import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../../../core/config/env_config.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  bool _isLoading = false;
  bool _isUpgrading = false;
  String? _errorMessage;
  Map<String, dynamic>? _subscription;

  @override
  void initState() {
    super.initState();
    _loadSubscription();
  }

  Future<void> _loadSubscription() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final token = await _storage.read(key: 'supabase_token');
    if (token == null) {
      setState(() {
        _errorMessage = 'Please login first';
        _isLoading = false;
      });
      return;
    }

    final baseUrl = EnvConfig.backendBaseUrl;
    try {
      final response = await _dio.get(
        '$baseUrl/api/subscriptions/status',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (mounted) {
        setState(() {
          _subscription = response.data;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _upgradeToPremium() async {
    setState(() {
      _isUpgrading = true;
      _errorMessage = null;
    });

    final token = await _storage.read(key: 'supabase_token');
    if (token == null) {
      setState(() {
        _errorMessage = 'Please login first';
        _isUpgrading = false;
      });
      return;
    }

    final baseUrl = EnvConfig.backendBaseUrl;
    try {
      await _dio.post(
        '$baseUrl/api/subscriptions/upgrade',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
        data: {
          'plan_type': 'premium',
          'payment_method': 'telebirr',
        },
      );

      if (mounted) {
        setState(() => _isUpgrading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Upgraded to Premium!'),
            backgroundColor: Colors.green,
          ),
        );
        await _loadSubscription();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _isUpgrading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscription'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text('Error: $_errorMessage'))
              : _buildContent(context),
    );
  }

  Widget _buildContent(BuildContext context) {
    final isPremium = _subscription?['is_active'] == true &&
        _subscription?['plan_type'] == 'premium';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Current plan card
          Card(
            elevation: 2,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(
                    isPremium ? Icons.star : Icons.star_border,
                    size: 60,
                    color: isPremium ? Colors.amber : Colors.grey,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    isPremium ? 'Premium Plan' : 'Free Plan',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: isPremium ? Colors.amber : Colors.grey,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (isPremium) ...[
                    Text(
                      '✅ Active',
                      style: TextStyle(
                          color: Colors.green, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Expires: ${_subscription?['expires_at']?.toString().split('T')[0] ?? 'N/A'}',
                      style: TextStyle(fontSize: 14, color: Colors.grey),
                    ),
                  ] else ...[
                    const Text(
                      'Basic features only',
                      style: TextStyle(fontSize: 14, color: Colors.grey),
                    ),
                  ],
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Features comparison
          const Text(
            'Compare Plans',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _buildFeatureRow('✅', '❌', 'Smart Advisory Alerts'),
                  _buildFeatureRow('✅', '✅', 'Basic Market Prices'),
                  _buildFeatureRow('✅', '❌', 'Weather Forecasts'),
                  _buildFeatureRow('✅', '❌', 'SMS Alerts (offline)'),
                  _buildFeatureRow('✅', '❌', 'Priority Support'),
                  _buildFeatureRow('✅', '✅', 'Create Listings'),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Upgrade button
          if (!isPremium)
            ElevatedButton(
              onPressed: _isUpgrading ? null : _upgradeToPremium,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.amber,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _isUpgrading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text(
                      'Upgrade to Premium (ETB 299/month)',
                      style: TextStyle(fontSize: 18, color: Colors.white),
                    ),
            ),

          if (isPremium)
            ElevatedButton(
              onPressed: () {
                // Navigate to premium features
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text(
                'Premium Features',
                style: TextStyle(fontSize: 18, color: Colors.white),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFeatureRow(String premium, String free, String feature) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Row(
              children: [
                Text(
                  premium,
                  style: TextStyle(
                    color: premium == '✅' ? Colors.green : Colors.grey,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  free,
                  style: TextStyle(
                    color: free == '✅' ? Colors.green : Colors.grey,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(feature),
        ],
      ),
    );
  }
}
