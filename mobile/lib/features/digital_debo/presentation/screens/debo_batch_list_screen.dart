import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DeboBatchListScreen extends StatefulWidget {
  const DeboBatchListScreen({super.key});

  @override
  State<DeboBatchListScreen> createState() => _DeboBatchListScreenState();
}

class _DeboBatchListScreenState extends State<DeboBatchListScreen> {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  final TextEditingController _cropController = TextEditingController();
  final TextEditingController _quantityController = TextEditingController();
  final TextEditingController _radiusController =
      TextEditingController(text: '50');

  bool _isLoading = false;
  String? _errorMessage;
  List<dynamic> _clusters = [];

  Future<void> _searchClusters() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _clusters = [];
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
      final lat = 9.032;
      final lng = 38.742;

      final response = await _dio.post(
        '$baseUrl/api/debo/aggregate',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
        data: {
          'crop_type': _cropController.text,
          'target_quantity': double.parse(_quantityController.text),
          'lat': lat,
          'lng': lng,
          'radius': double.parse(_radiusController.text) * 1000,
        },
      );

      if (mounted) {
        setState(() {
          _clusters = response.data['viable_clusters'] ?? [];
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

  Future<void> _createBatch(List<dynamic> listings) async {
    setState(() => _isLoading = true);

    final token = await _storage.read(key: 'supabase_token');
    final baseUrl = dotenv.env['BACKEND_API_BASE_URL']!;

    try {
      final response = await _dio.post(
        '$baseUrl/api/debo/batches',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
        data: {
          'cluster_listings': listings,
          'crop_type': _cropController.text,
        },
      );

      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('✅ ${response.data['message']}'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Digital Debo'),
        backgroundColor: Colors.orange,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Search form
            Card(
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    TextField(
                      controller: _cropController,
                      decoration: const InputDecoration(
                        labelText: 'Crop Type *',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.agriculture),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _quantityController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Target Quantity (quintals) *',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.numbers),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _radiusController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Search Radius (km)',
                        border: OutlineInputBorder(),
                        suffixText: 'km',
                        prefixIcon: Icon(Icons.gps_fixed), // ✅ Fixed
                      ),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton(
                      onPressed: _isLoading ? null : _searchClusters,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: _isLoading
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text(
                              '🔍 Find Clusters',
                              style:
                                  TextStyle(fontSize: 18, color: Colors.white),
                            ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Results
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _errorMessage != null
                      ? Center(child: Text('Error: $_errorMessage'))
                      : _clusters.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: const [
                                  // ✅ Removed 'const' from children list
                                  Icon(Icons.search_off,
                                      size: 64, color: Colors.grey),
                                  SizedBox(height: 16),
                                  Text(
                                    'No clusters found',
                                    style: TextStyle(
                                        fontSize: 18, color: Colors.grey),
                                  ),
                                  Text(
                                    'Try adjusting your search criteria',
                                    style: TextStyle(
                                        fontSize: 14, color: Colors.grey),
                                  ),
                                ],
                              ),
                            )
                          : ListView.builder(
                              itemCount: _clusters.length,
                              itemBuilder: (context, index) {
                                final cluster = _clusters[index];
                                return Card(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  elevation: 2,
                                  child: ExpansionTile(
                                    leading: CircleAvatar(
                                      backgroundColor: Colors.orange,
                                      child: Text(
                                        '${cluster['farmer_count']}',
                                        style: const TextStyle(
                                            color: Colors.white),
                                      ),
                                    ),
                                    title: Text(
                                      '${cluster['total_quantity']} ${_cropController.text}',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.bold),
                                    ),
                                    subtitle: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                            'Avg Price: ETB ${cluster['average_price_per_unit']?.toStringAsFixed(2) ?? 'N/A'}'),
                                        Text(
                                            '${cluster['farmer_count']} farmers'),
                                        if (cluster['meets_target'] == true)
                                          const Text(
                                            '✅ Meets your quantity target',
                                            style:
                                                TextStyle(color: Colors.green),
                                          ),
                                      ],
                                    ),
                                    children: [
                                      const Divider(),
                                      Padding(
                                        padding: const EdgeInsets.all(12.0),
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            const Text(
                                              'Farmer Listings:',
                                              style: TextStyle(
                                                  fontWeight: FontWeight.bold),
                                            ),
                                            const SizedBox(height: 8),
                                            ...cluster['listings']
                                                    ?.map<Widget>((l) =>
                                                        Padding(
                                                          padding:
                                                              const EdgeInsets
                                                                  .symmetric(
                                                                  vertical: 4),
                                                          child: Row(
                                                            mainAxisAlignment:
                                                                MainAxisAlignment
                                                                    .spaceBetween,
                                                            children: [
                                                              Text(
                                                                  '${l['quantity']} quintals'),
                                                              Text(
                                                                  'ETB ${l['price_per_unit']}'),
                                                              if (l['trust_score'] !=
                                                                  null)
                                                                Text(
                                                                  '⭐ ${(l['trust_score'] * 100).toStringAsFixed(0)}%',
                                                                  style: const TextStyle(
                                                                      fontSize:
                                                                          12),
                                                                ),
                                                            ],
                                                          ),
                                                        ))
                                                    ?.toList() ??
                                                [],
                                            const SizedBox(height: 16),
                                            ElevatedButton.icon(
                                              onPressed: () => _createBatch(
                                                  cluster['listings'] ?? []),
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor: Colors.green,
                                                minimumSize: const Size(
                                                    double.infinity, 48),
                                              ),
                                              icon: const Icon(
                                                  Icons.shopping_cart,
                                                  color: Colors.white),
                                              label: const Text(
                                                'Purchase Bulk Lot',
                                                style: TextStyle(
                                                    color: Colors.white),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
            ),
          ],
        ),
      ),
    );
  }
}
