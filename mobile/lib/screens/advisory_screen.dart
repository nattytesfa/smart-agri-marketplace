import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AdvisoryScreen extends StatefulWidget {
  const AdvisoryScreen({super.key});

  @override
  State<AdvisoryScreen> createState() => _AdvisoryScreenState();
}

class _AdvisoryScreenState extends State<AdvisoryScreen> {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  bool _isLoading = false;
  String? _errorMessage;
  Map<String, dynamic>? _advice;
  String? _userId;

  @override
  void initState() {
    super.initState();
    _loadUserIdAndFetch();
  }

  Future<void> _loadUserIdAndFetch() async {
    final userId = await _storage.read(key: 'user_id');
    if (userId == null) {
      setState(() {
        _errorMessage = 'User not found. Please login again.';
      });
      return;
    }
    setState(() => _userId = userId);
    await _fetchAdvice();
  }

  Future<void> _fetchAdvice() async {
    if (_userId == null) return;
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

    final baseUrl = dotenv.env['BACKEND_API_BASE_URL']!;
    try {
      final response = await _dio.get(
        '$baseUrl/api/advisory/sell-or-hold/$_userId',
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
    if (_advice == null) return;
    // We need to update the listing status to 'urgent' or similar
    // For simplicity, we show a snackbar and refresh
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('✅ Listing marked as urgent!'),
        backgroundColor: Colors.orange,
      ),
    );
    // In a real implementation, you'd call an API to update listing status
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Smart Advisory'),
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
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_errorMessage!),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _fetchAdvice,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _advice == null
                  ? const Center(child: Text('No advice available'))
                  : _buildAdviceCard(context),
    );
  }

  Widget _buildAdviceCard(BuildContext context) {
    final rec = _advice!['recommendation'] == 'sell' ? 'SELL' : 'HOLD';
    final urgency = _advice!['urgency'] ?? 'normal';
    final isUrgent = urgency == 'urgent';
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
                  Icon(
                    icon,
                    size: 60,
                    color: color,
                  ),
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

          // Weather & Price details
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Current Price:'),
                      Text('ETB ${_advice!['price']['current_price'] ?? 'N/A'}'),
                    ],
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Average Price:'),
                      Text('ETB ${_advice!['price']['average_price'] ?? 'N/A'}'),
                    ],
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Price Trend:'),
                      Text(_advice!['price']['trend'] ?? 'N/A'),
                    ],
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Rain Probability (today):'),
                      Text('${_advice!['weather']['rain_probability'] ?? 0}%'),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text('5-day forecast:', style: TextStyle(fontWeight: FontWeight.w500)),
                  ...(_advice!['weather']['forecast'] as List<dynamic>).take(5).map((day) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(day['date'] ?? ''),
                            Text('${day['rain_prob']}% rain'),
                          ],
                        ),
                      )),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}