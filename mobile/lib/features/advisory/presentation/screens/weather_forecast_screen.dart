
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class WeatherForecastScreen extends StatefulWidget {
  const WeatherForecastScreen({super.key});

  @override
  State<WeatherForecastScreen> createState() => _WeatherForecastScreenState();
}

class _WeatherForecastScreenState extends State<WeatherForecastScreen> {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  bool _isLoading = false;
  String? _errorMessage;
  List<dynamic> _forecast = [];
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
      await _fetchWeather();
    }
  }

  Future<void> _fetchWeather() async {
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

    final baseUrl = dotenv.env['BACKEND_API_BASE_URL']!;
    try {
      final response = await _dio.get(
        '$baseUrl/api/advisory/weather/$_farmerId',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (mounted) {
        setState(() {
          _forecast = response.data['forecast'] ?? [];
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
        title: const Text('Weather Forecast'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchWeather,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text('Error: $_errorMessage'))
              : _forecast.isEmpty
                  ? const Center(child: Text('No forecast data available'))
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _forecast.length,
                      itemBuilder: (context, index) {
                        final day = _forecast[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                // Date
                                Expanded(
                                  flex: 2,
                                  child: Text(
                                    day['date'] ?? 'N/A',
                                    style: const TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                ),
                                // Temp
                                Expanded(
                                  flex: 2,
                                  child: Text(
                                    '${day['temp_min']}°C - ${day['temp_max']}°C',
                                  ),
                                ),
                                // Rain probability
                                Expanded(
                                  flex: 2,
                                  child: Row(
                                    children: [
                                      const Icon(Icons.water_drop, size: 16, color: Colors.blue),
                                      Text('${day['rain_prob']}%'),
                                    ],
                                  ),
                                ),
                                // Icon
                                Icon(
                                  day['rain_prob'] > 50 ? Icons.umbrella : Icons.wb_sunny,
                                  color: day['rain_prob'] > 50 ? Colors.blue : Colors.orange,
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}