
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../../../core/config/env_config.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SellOrHoldScreen extends StatefulWidget {
  const SellOrHoldScreen({super.key});

  @override
  State<SellOrHoldScreen> createState() => _SellOrHoldScreenState();
}

class _SellOrHoldScreenState extends State<SellOrHoldScreen> {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  bool _isLoading = false;
  String? _errorMessage;
  Map<String, dynamic>? _advice;
  String? _farmerId;

  @override
  void initState() {
    super.initState();
    _loadFarmerId();
  }

  Future<void> _loadFarmerId() async {
    final userId = await _storage.read(key: 'user_id');
    if (userId != null) {
      setState(() => _farmerId = userId);
      await _fetchAdvice();
    }
  }

  Future<void> _fetchAdvice() async {
    if (_farmerId == null) return;
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
        '$baseUrl/api/advisory/sell-or-hold/$_farmerId',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (mounted) {
        setState(() {
          _advice = response.data;
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

  Future<void> _markUrgent() async {
    // TODO: Update listing status to 'urgent'
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('✅ Listing marked as urgent!'),
        backgroundColor: Colors.orange,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sell or Hold'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchAdvice,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text('Error: $_errorMessage'))
              : _advice == null
                  ? const Center(child: Text('No advice available'))
                  : _buildAdviceCard(context),
    );
  }

  Widget _buildAdviceCard(BuildContext context) {
    final rec = _advice!['recommendation'] == 'sell' ? 'SELL' : 'HOLD';
    final isUrgent = _advice!['urgency'] == 'urgent';
    final color = rec == 'SELL' ? Colors.red : Colors.blue;
    final icon = rec == 'SELL' ? Icons.sell : Icons.hourglass_bottom;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Main recommendation card
          Card(
            elevation: 4,
            color: isUrgent ? Colors.red.shade50 : Colors.grey.shade50,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(icon, size: 60, color: color),
                  const SizedBox(height: 12),
                  Text(
                    rec,
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: color,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (isUrgent)
                    const Chip(
                      label: Text('URGENT', style: TextStyle(color: Colors.white)),
                      backgroundColor: Colors.red,
                    ),
                  const SizedBox(height: 12),
                  Text(
                    _advice!['message'] ?? '',
                    style: const TextStyle(fontSize: 16),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Action buttons
          if (rec == 'SELL')
            ElevatedButton.icon(
              onPressed: _markUrgent,
              icon: const Icon(Icons.warning, color: Colors.white),
              label: const Text('Mark as Urgent (Ready for Pickup)'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange,
                minimumSize: const Size(double.infinity, 50),
              ),
            ),
          const SizedBox(height: 12),

          // Details
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Market & Weather Insights',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const Divider(),
                  _buildDetailRow('Current Price', 'ETB ${_advice!['price']['current_price'] ?? 'N/A'}'),
                  _buildDetailRow('Average Price', 'ETB ${_advice!['price']['average_price'] ?? 'N/A'}'),
                  _buildDetailRow('Price Trend', _advice!['price']['trend'] ?? 'N/A'),
                  _buildDetailRow('Rain Probability', '${_advice!['weather']['rain_probability'] ?? 0}%'),
                  _buildDetailRow('Storage Type', _advice!['storage_type'] ?? 'N/A'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}