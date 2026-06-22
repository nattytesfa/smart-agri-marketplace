
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class PriceTrendScreen extends StatefulWidget {
  const PriceTrendScreen({super.key});

  @override
  State<PriceTrendScreen> createState() => _PriceTrendScreenState();
}

class _PriceTrendScreenState extends State<PriceTrendScreen> {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  bool _isLoading = false;
  String? _errorMessage;
  Map<String, dynamic>? _priceData;
  final TextEditingController _cropController = TextEditingController();
  final List<String> _commonCrops = ['teff', 'wheat', 'maize', 'barley', 'coffee'];

  @override
  void initState() {
    super.initState();
    // Load default crop
    _cropController.text = 'teff';
    _fetchPrices();
  }

  Future<void> _fetchPrices() async {
    final crop = _cropController.text.trim().toLowerCase();
    if (crop.isEmpty) {
      setState(() => _errorMessage = 'Please enter a crop name');
      return;
    }

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
        '$baseUrl/api/advisory/prices',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
        queryParameters: {'crop': crop},
      );

      if (mounted) {
        setState(() {
          _priceData = response.data;
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Price Trends'),
        backgroundColor: Colors.orange,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Search bar
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _cropController,
                    decoration: const InputDecoration(
                      labelText: 'Crop Name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _fetchPrices,
                  child: const Text('Search'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Quick crop chips
            Wrap(
              spacing: 8,
              children: _commonCrops.map((crop) => ActionChip(
                label: Text(crop),
                onPressed: () {
                  _cropController.text = crop;
                  _fetchPrices();
                },
              )).toList(),
            ),
            const SizedBox(height: 16),

            // Results
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _errorMessage != null
                      ? Center(child: Text('Error: $_errorMessage'))
                      : _priceData == null
                          ? const Center(child: Text('No price data'))
                          : _buildPriceCard(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPriceCard() {
    final data = _priceData!;
    final trend = data['trend'] ?? 'stable';
    Color trendColor;
    IconData trendIcon;

    switch (trend) {
      case 'up':
        trendColor = Colors.green;
        trendIcon = Icons.trending_up;
        break;
      case 'down':
        trendColor = Colors.red;
        trendIcon = Icons.trending_down;
        break;
      default:
        trendColor = Colors.grey;
        trendIcon = Icons.trending_flat;
    }

    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              data['crop'] ?? 'Unknown',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Text(
              'ETB ${data['current_price'] ?? 0}',
              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(trendIcon, color: trendColor),
                const SizedBox(width: 8),
                Text(
                  trend.toUpperCase(),
                  style: TextStyle(color: trendColor, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 16),
                Text(
                  '${data['percentage_change'] ?? 0}%',
                  style: TextStyle(color: trendColor),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Average: ETB ${data['average_price'] ?? 0}',
              style: const TextStyle(color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}