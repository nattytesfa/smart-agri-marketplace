import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ListingListScreen extends StatefulWidget {
  const ListingListScreen({super.key});

  @override
  State<ListingListScreen> createState() => _ListingListScreenState();
}

class _ListingListScreenState extends State<ListingListScreen> {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  List<dynamic> _listings = [];
  bool _isLoading = false;
  String? _errorMessage;

  // Filters
  String? _selectedCropType;
  double _minPrice = 0;
  double _maxPrice = 1000;
  double _radius = 50; // km
  final LatLng _currentLocation = const LatLng(9.032, 38.742); // Addis Ababa

  final TextEditingController _cropController = TextEditingController();
  final TextEditingController _minPriceController =
      TextEditingController(text: '0');
  final TextEditingController _maxPriceController =
      TextEditingController(text: '1000');
  final TextEditingController _radiusController =
      TextEditingController(text: '50');

  // Google Maps
  // ignore: unused_field
  GoogleMapController? _mapController;
  final Set<Marker> _markers = {};

  @override
  void initState() {
    super.initState();
    _fetchListings();
  }

  Future<void> _fetchListings() async {
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
        '$baseUrl/api/listings',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
        queryParameters: {
          if (_selectedCropType != null && _selectedCropType!.isNotEmpty)
            'crop_type': _selectedCropType,
          'min_price': _minPrice,
          'max_price': _maxPrice,
          'radius': _radius * 1000,
          'lat': _currentLocation.latitude,
          'lng': _currentLocation.longitude,
        },
      );

      if (mounted) {
        setState(() {
          _listings = response.data;
          _isLoading = false;
          _updateMarkers();
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

  void _updateMarkers() {
    final markers = <Marker>{};
    for (var listing in _listings) {
      final lat = listing['lat'];
      final lng = listing['lng'];
      if (lat != null && lng != null) {
        markers.add(
          Marker(
            markerId: MarkerId(listing['listing_id']),
            position: LatLng(lat, lng),
            infoWindow: InfoWindow(
              title: listing['crop_type'],
              snippet:
                  '${listing['quantity']} ${listing['unit']} @ ETB ${listing['price_per_unit']}',
            ),
            icon: BitmapDescriptor.defaultMarkerWithHue(
              BitmapDescriptor.hueGreen,
            ),
          ),
        );
      }
    }
    setState(() {
      _markers.clear();
      _markers.addAll(markers);
    });
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Filter Listings'),
        content: SingleChildScrollView(
          child: Column(
            children: [
              TextField(
                controller: _cropController,
                decoration: const InputDecoration(
                  labelText: 'Crop Type (e.g., Teff, Wheat)',
                ),
                onChanged: (v) => _selectedCropType = v.isEmpty ? null : v,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _minPriceController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Min Price'),
                      onChanged: (v) => _minPrice = double.tryParse(v) ?? 0,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _maxPriceController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Max Price'),
                      onChanged: (v) => _maxPrice = double.tryParse(v) ?? 1000,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _radiusController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Radius (km)',
                  suffixText: 'km',
                ),
                onChanged: (v) => _radius = double.tryParse(v) ?? 50,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _fetchListings();
            },
            child: const Text('Apply'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Available Produce'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterDialog,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchListings,
          ),
        ],
      ),
      body: Column(
        children: [
          // Map (60% of space)
          Expanded(
            flex: 2,
            child: GoogleMap(
              onMapCreated: (controller) => _mapController = controller,
              initialCameraPosition: CameraPosition(
                target: _currentLocation,
                zoom: 12,
              ),
              markers: _markers,
              myLocationEnabled: true,
            ),
          ),
          // List (40% of space)
          Expanded(
            flex: 1,
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorMessage != null
                    ? Center(child: Text('Error: $_errorMessage'))
                    : _listings.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: const [
                                Icon(Icons.search_off,
                                    size: 48, color: Colors.grey),
                                SizedBox(height: 8),
                                Text('No listings found'),
                                Text(
                                  'Try adjusting your filters',
                                  style: TextStyle(fontSize: 12),
                                ),
                              ],
                            ),
                          )
                        : ListView.builder(
                            itemCount: _listings.length,
                            itemBuilder: (context, index) {
                              final listing = _listings[index];
                              return Card(
                                margin: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 4),
                                child: ListTile(
                                  leading: const Icon(Icons.agriculture,
                                      color: Colors.green),
                                  title:
                                      Text(listing['crop_type'] ?? 'Unknown'),
                                  subtitle: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                          '${listing['quantity']} ${listing['unit'] ?? 'quintal'}'),
                                      Text('ETB ${listing['price_per_unit']}'),
                                      if (listing['social_trust_score'] != null)
                                        Text(
                                          '⭐ Trust: ${(listing['social_trust_score'] * 100).toStringAsFixed(0)}%',
                                          style: const TextStyle(fontSize: 12),
                                        ),
                                    ],
                                  ),
                                  trailing: const Icon(Icons.arrow_forward_ios),
                                  onTap: () {
                                    // TODO: Implement listing_detail_screen
                                  },
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}
