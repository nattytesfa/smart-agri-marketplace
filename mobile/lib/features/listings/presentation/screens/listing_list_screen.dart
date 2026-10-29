import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../../../data/models/listing_model.dart';
import '../../../../data/models/listing_validation.dart';
import '../../../../data/remote/listings_api.dart';
import '../widgets/listing_card.dart';
import 'listing_detail_screen.dart';

class ListingListScreen extends StatefulWidget {
  const ListingListScreen({super.key});
  @override
  State<ListingListScreen> createState() => _ListingListScreenState();
}

class _ListingListScreenState extends State<ListingListScreen> {
  final _search = TextEditingController(),
      _min = TextEditingController(),
      _max = TextEditingController(),
      _location = TextEditingController(),
      _radius = TextEditingController(),
      _from = TextEditingController(),
      _to = TextEditingController();
  String? _crop, _grade, _unit;
  String _sort = 'newest', _status = 'available';
  double? _lat, _lng;
  List<ListingModel> _listings = [];
  bool _loading = false, _more = true;
  String? _error;
  @override
  void initState() {
    super.initState();
    _fetch();
  }

  @override
  void dispose() {
    for (final c in [_search, _min, _max, _location, _radius, _from, _to]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _fetch({bool more = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if ((_radius.text.isNotEmpty || _sort == 'distance') && _lat == null) {
        throw Exception('Capture your GPS location to use distance filters.');
      }
      for (final value in [_min.text, _max.text, _radius.text]) {
        if (value.isNotEmpty &&
            (double.tryParse(value) == null ||
                !double.parse(value).isFinite ||
                double.parse(value) < 0)) {
          throw Exception(
              'Price and radius must be valid nonnegative numbers.');
        }
      }
      final response = await listingApi().get('/listings', queryParameters: {
        if (_search.text.trim().isNotEmpty) 'search': _search.text.trim(),
        if (_crop != null) 'crop_type': _crop,
        if (_grade != null) 'quality_grade': _grade,
        if (_unit != null) 'unit': _unit,
        if (_min.text.isNotEmpty) 'min_price': _min.text,
        if (_max.text.isNotEmpty) 'max_price': _max.text,
        if (_location.text.trim().isNotEmpty) 'location': _location.text.trim(),
        if (_from.text.isNotEmpty) 'harvest_from': _from.text,
        if (_to.text.isNotEmpty) 'harvest_to': _to.text,
        if (_radius.text.isNotEmpty)
          'radius': double.parse(_radius.text) * 1000,
        if (_lat != null) 'lat': _lat,
        if (_lng != null) 'lng': _lng,
        'sort': _sort,
        'status': _status,
        'limit': 20,
        'offset': more ? _listings.length : 0,
      });
      final rows = (response.data as List)
          .map((j) => ListingModel.fromJson(Map<String, dynamic>.from(j)))
          .toList();
      if (mounted) {
        setState(() {
          _listings = more ? [..._listings, ...rows] : rows;
          _more = rows.length == 20;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not load listings. $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _gps() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      final p = await Geolocator.getCurrentPosition(
          locationSettings:
              const LocationSettings(timeLimit: Duration(seconds: 15)));
      _lat = p.latitude;
      _lng = p.longitude;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('GPS captured. Apply filters to search.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('GPS unavailable. Use Kebele search without radius.')));
      }
    }
  }

  Future<void> _filters() async {
    await showDialog<void>(
        context: context,
        builder: (c) => StatefulBuilder(
            builder: (c, update) => AlertDialog(
                  title: const Text('Filter Produce'),
                  content: SizedBox(
                      width: 400,
                      child: SingleChildScrollView(
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                        DropdownButtonFormField<String>(
                            initialValue: _crop,
                            decoration:
                                const InputDecoration(labelText: 'Crop'),
                            items: [
                              const DropdownMenuItem<String>(
                                  value: null, child: Text('All crops')),
                              ...cropTypes.where((v) => v != 'Other').map((v) =>
                                  DropdownMenuItem(value: v, child: Text(v)))
                            ],
                            onChanged: (v) => update(() => _crop = v)),
                        TextField(
                            controller: _min,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                                labelText: 'Minimum price (ETB/unit)')),
                        TextField(
                            controller: _max,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                                labelText: 'Maximum price (ETB/unit)')),
                        DropdownButtonFormField<String>(
                            initialValue: _unit,
                            decoration: const InputDecoration(
                                labelText:
                                    'Unit (filter before comparing prices)'),
                            items: [
                              const DropdownMenuItem<String>(
                                  value: null, child: Text('All units')),
                              ...listingUnits.map((v) =>
                                  DropdownMenuItem(value: v, child: Text(v)))
                            ],
                            onChanged: (v) => update(() => _unit = v)),
                        TextField(
                            controller: _location,
                            decoration:
                                const InputDecoration(labelText: 'Kebele')),
                        TextButton.icon(
                            onPressed: _gps,
                            icon: const Icon(Icons.gps_fixed),
                            label:
                                const Text('Capture GPS for radius/distance')),
                        TextField(
                            controller: _radius,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                                labelText: 'Radius (km, optional)')),
                        DropdownButtonFormField<String>(
                            initialValue: _status,
                            decoration: const InputDecoration(
                                labelText: 'Availability'),
                            items: ['available', 'reserved', 'sold']
                                .map((v) =>
                                    DropdownMenuItem(value: v, child: Text(v)))
                                .toList(),
                            onChanged: (v) => update(() => _status = v!)),
                        DropdownButtonFormField<String>(
                            initialValue: _grade,
                            decoration: const InputDecoration(
                                labelText: 'Farmer-reported grade'),
                            items: [
                              const DropdownMenuItem<String>(
                                  value: null, child: Text('All grades')),
                              ...qualityGrades.entries.map((e) =>
                                  DropdownMenuItem(
                                      value: e.key, child: Text(e.value)))
                            ],
                            onChanged: (v) => update(() => _grade = v)),
                        TextField(
                            controller: _from,
                            readOnly: true,
                            decoration: InputDecoration(
                                labelText: 'Harvested from',
                                suffixIcon: IconButton(
                                    icon: const Icon(Icons.clear),
                                    onPressed: () => update(_from.clear))),
                            onTap: () async {
                              final d = await showDatePicker(
                                  context: c,
                                  firstDate: DateTime(1900),
                                  lastDate: DateTime.now(),
                                  initialDate: DateTime.now());
                              if (d != null && c.mounted) {
                                update(() => _from.text =
                                    d.toIso8601String().split('T').first);
                              }
                            }),
                        TextField(
                            controller: _to,
                            readOnly: true,
                            decoration: InputDecoration(
                                labelText: 'Harvested through',
                                suffixIcon: IconButton(
                                    icon: const Icon(Icons.clear),
                                    onPressed: () => update(_to.clear))),
                            onTap: () async {
                              final d = await showDatePicker(
                                  context: c,
                                  firstDate: DateTime(1900),
                                  lastDate: DateTime.now(),
                                  initialDate: DateTime.now());
                              if (d != null && c.mounted) {
                                update(() => _to.text =
                                    d.toIso8601String().split('T').first);
                              }
                            }),
                        DropdownButtonFormField<String>(
                            initialValue: _sort,
                            decoration:
                                const InputDecoration(labelText: 'Sort'),
                            items: const [
                              DropdownMenuItem(
                                  value: 'newest', child: Text('Newest')),
                              DropdownMenuItem(
                                  value: 'price_asc',
                                  child: Text('Price: low to high')),
                              DropdownMenuItem(
                                  value: 'price_desc',
                                  child: Text('Price: high to low')),
                              DropdownMenuItem(
                                  value: 'distance',
                                  child: Text('Distance (GPS only)'))
                            ],
                            onChanged: (v) => update(() => _sort = v!)),
                      ]))),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(c),
                        child: const Text('Close')),
                    FilledButton(
                        onPressed: () {
                          Navigator.pop(c);
                          _fetch();
                        },
                        child: const Text('Apply'))
                  ],
                )));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Available Produce'), actions: [
        IconButton(
            tooltip: 'Filters',
            onPressed: _filters,
            icon: const Icon(Icons.filter_list)),
        IconButton(
            tooltip: 'Refresh',
            onPressed: () => _fetch(),
            icon: const Icon(Icons.refresh)),
      ]),
      body: Column(children: [
        Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
                controller: _search,
                decoration: InputDecoration(
                    labelText: 'Search crop or variety',
                    suffixIcon: IconButton(
                        onPressed: () => _fetch(),
                        icon: const Icon(Icons.search))),
                onSubmitted: (_) => _fetch())),
        if (_loading) const LinearProgressIndicator(),
        if (_error != null)
          Padding(
              padding: const EdgeInsets.all(8),
              child: Text(_error!, style: const TextStyle(color: Colors.red))),
        Expanded(
            child: _listings.isEmpty && !_loading
                ? const Center(
                    child:
                        Text('No listings found. Try adjusting your filters.'))
                : RefreshIndicator(
                    onRefresh: () => _fetch(),
                    child: ListView.builder(
                        itemCount: _listings.length + 1,
                        itemBuilder: (_, i) {
                          if (i == _listings.length) {
                            return _more
                                ? TextButton(
                                    onPressed: _loading
                                        ? null
                                        : () => _fetch(more: true),
                                    child: const Text('Load more'))
                                : const SizedBox(height: 20);
                          }
                          return ListingCard(
                              listing: _listings[i],
                              onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) => ListingDetailScreen(
                                          listing: _listings[i]))));
                        }))),
      ]));
}
