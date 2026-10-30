import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:uuid/uuid.dart';
import '../../../../data/models/listing_validation.dart';
import '../../../../data/remote/debo_api.dart';
import 'debo_batch_detail_screen.dart';

class DeboRequestScreen extends StatefulWidget {
  final DeboApi? api;
  const DeboRequestScreen({super.key, this.api});
  @override
  State<DeboRequestScreen> createState() => _DeboRequestScreenState();
}

class _DeboRequestScreenState extends State<DeboRequestScreen> {
  final _form = GlobalKey<FormState>();
  final _quantity = TextEditingController(),
      _radius = TextEditingController(text: '50'),
      _lat = TextEditingController(),
      _lng = TextEditingController(),
      _location = TextEditingController(),
      _variety = TextEditingController(),
      _price = TextEditingController(),
      _date = TextEditingController(),
      _notes = TextEditingController(),
      _customCrop = TextEditingController();
  String _crop = 'Teff', _unit = 'quintal';
  String? _grade, _error;
  bool _busy = false;
  Map<String, dynamic>? _proposal, _criteria;
  String? _requestId;
  late final _api = widget.api ?? DeboApi();
  @override
  void dispose() {
    for (final c in [
      _quantity,
      _radius,
      _lat,
      _lng,
      _location,
      _variety,
      _price,
      _date,
      _notes,
      _customCrop
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _gps() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw Exception(
            'Enable location services or enter verified coordinates.');
      }
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) {
        p = await Geolocator.requestPermission();
      }
      if (p == LocationPermission.denied ||
          p == LocationPermission.deniedForever) {
        throw Exception(
            'Location permission denied. No coordinates will be guessed.');
      }
      final pos = await Geolocator.getCurrentPosition(
          locationSettings:
              const LocationSettings(timeLimit: Duration(seconds: 20)));
      if (mounted) {
        setState(() {
          _lat.text = '${pos.latitude}';
          _lng.text = '${pos.longitude}';
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = deboError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _search() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
      _proposal = null;
    });
    final data = <String, dynamic>{
      'crop_type': _crop == 'Other' ? _customCrop.text.trim() : _crop,
      'target_quantity': double.parse(_quantity.text),
      'unit': _unit,
      'lat': double.parse(_lat.text),
      'lng': double.parse(_lng.text),
      'radius': double.parse(_radius.text) * 1000,
      if (_location.text.trim().isNotEmpty)
        'preferred_location': _location.text.trim(),
      if (_variety.text.trim().isNotEmpty) 'variety': _variety.text.trim(),
      if (_grade != null) 'quality_grade': _grade,
      if (_price.text.isNotEmpty) 'max_price': double.parse(_price.text),
      if (_date.text.isNotEmpty) 'delivery_date': _date.text,
      if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim()
    };
    try {
      final p = await _api.preview(data);
      if (mounted) {
        setState(() {
          _proposal = p;
          _criteria = data;
          _requestId = const Uuid().v4();
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = deboError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // Keep this key on a network error: retrying cannot create a second batch.
      final b = await _api.create({..._criteria!, 'request_id': _requestId});
      if (mounted) {
        Navigator.pushReplacement(
            context,
            MaterialPageRoute(
                builder: (_) =>
                    DeboBatchDetailScreen(batchId: b['batch_id'], api: _api)));
      }
    } catch (e) {
      if (mounted) setState(() => _error = deboError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(String label, TextEditingController c,
          {String? Function(String?)? validator, bool number = false}) =>
      Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: TextFormField(
              controller: c,
              enabled: !_busy,
              decoration: InputDecoration(
                  labelText: label, border: const OutlineInputBorder()),
              keyboardType: number
                  ? const TextInputType.numberWithOptions(
                      decimal: true, signed: true)
                  : TextInputType.text,
              validator: validator));
  String? _coordinate(String? v, double limit) {
    final n = double.tryParse(v ?? '');
    return n == null || !n.isFinite || n.abs() > limit
        ? 'Enter coordinates between -$limit and $limit'
        : null;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Request aggregated produce')),
      body: Form(
          key: _form,
          onChanged: () {
            if (_proposal != null) {
              setState(() {
                _proposal = null;
                _criteria = null;
                _requestId = null;
              });
            }
          },
          child: ListView(padding: const EdgeInsets.all(16), children: [
            const Text(
                'Proposals are invitations, not purchases. Only farmer-confirmed reservations count as committed stock.'),
            DropdownButtonFormField<String>(
                initialValue: _crop,
                decoration: const InputDecoration(labelText: 'Crop'),
                items: cropTypes
                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: _busy ? null : (v) => setState(() => _crop = v!)),
            if (_crop == 'Other')
              _field('Crop name', _customCrop, validator: requiredText),
            _field('Target quantity', _quantity,
                validator: positiveNumber, number: true),
            DropdownButtonFormField<String>(
                initialValue: _unit,
                decoration: const InputDecoration(labelText: 'Quantity unit'),
                items: listingUnits
                    .map((u) => DropdownMenuItem(value: u, child: Text(u)))
                    .toList(),
                onChanged: _busy ? null : (v) => setState(() => _unit = v!)),
            _field('Preferred location name (optional)', _location),
            OutlinedButton.icon(
                onPressed: _busy ? null : _gps,
                icon: const Icon(Icons.my_location),
                label: const Text('Use current GPS location')),
            _field('Preferred latitude', _lat,
                number: true, validator: (v) => _coordinate(v, 90)),
            _field('Preferred longitude', _lng,
                number: true, validator: (v) => _coordinate(v, 180)),
            const Text(
                'Use verified coordinates for the preferred collection location. Kebele names are not converted into invented GPS points.'),
            _field('Radius (km, up to 200)', _radius,
                number: true,
                validator: (v) =>
                    positiveNumber(v) ??
                    (double.parse(v!) > 200
                        ? 'Maximum radius is 200 km'
                        : null)),
            _field('Variety (optional)', _variety),
            DropdownButtonFormField<String>(
                initialValue: _grade,
                decoration:
                    const InputDecoration(labelText: 'Grade preference'),
                items: [
                  const DropdownMenuItem<String>(
                      value: null, child: Text('Any grade')),
                  ...qualityGrades.entries.map((e) =>
                      DropdownMenuItem(value: e.key, child: Text(e.value)))
                ],
                onChanged: _busy ? null : (v) => setState(() => _grade = v)),
            _field('Maximum ETB per $_unit (optional)', _price,
                number: true,
                validator: (v) =>
                    (v?.isEmpty ?? true) ? null : positiveNumber(v)),
            _field('Delivery date YYYY-MM-DD (optional)', _date,
                validator: (v) {
              if (v == null || v.isEmpty) return null;
              final d = DateTime.tryParse(v);
              return d == null ||
                      d.toIso8601String().substring(0, 10) != v ||
                      v.compareTo(DateTime.now()
                              .toIso8601String()
                              .substring(0, 10)) <
                          0
                  ? 'Enter today or a future date as YYYY-MM-DD'
                  : null;
            }),
            _field('Notes (optional)', _notes,
                validator: descriptionValidation),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            if (_busy) const Center(child: CircularProgressIndicator()),
            FilledButton(
                onPressed: _busy ? null : _search,
                child: const Text('Find matching produce')),
            if (_proposal != null) ...[
              Text(
                  'Proposed ${deboQuantity(_proposal!['total_quantity'])} ${_proposal!['unit']} • ${_proposal!['farmer_count']} farmers'),
              Text(
                  'Estimated ETB ${deboNumber(_proposal!['estimated_total']).toStringAsFixed(2)}'),
              if (_proposal!['meets_target'] != true)
                const Text(
                    'Supply is insufficient. You can still create an incomplete request and refresh it later.'),
              for (final l in _proposal!['listings'])
                ListTile(
                    title: Text(
                        '${l['farmer_name'] ?? 'Farmer'} — ${deboQuantity(l['proposed_quantity'])} ${l['unit']}'),
                    subtitle: Text(
                        'Available ${deboQuantity(l['available_quantity'])} ${l['unit']} • ${(deboNumber(l['distance_meters']) / 1000).toStringAsFixed(2)} km\nETB ${l['unit_price']} / ${l['unit']} • subtotal ETB ${deboNumber(l['subtotal']).toStringAsFixed(2)}')),
              FilledButton(
                  onPressed: _busy ? null : _create,
                  child: const Text('Create request & invite farmers')),
              const Text(
                  'The server rechecks supply when creating invitations. Confirmations may differ from this preview.'),
            ],
          ])));
}
