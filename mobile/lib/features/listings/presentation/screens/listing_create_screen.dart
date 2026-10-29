import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../../../../data/models/listing_model.dart';
import '../../../../data/models/listing_validation.dart';
import '../../../../services/sync_service.dart';
import '../widgets/listing_card.dart';
import '../widgets/marketplace_ui.dart';

class ListingCreateScreen extends StatefulWidget {
  const ListingCreateScreen({super.key, this.listing});
  final ListingModel? listing;
  @override
  State<ListingCreateScreen> createState() => _ListingCreateScreenState();
}

class _ListingCreateScreenState extends State<ListingCreateScreen> {
  final _form = GlobalKey<FormState>();
  final _customCrop = TextEditingController();
  final _variety = TextEditingController();
  final _quantity = TextEditingController();
  final _price = TextEditingController();
  final _kebele = TextEditingController();
  final _description = TextEditingController();
  String? _crop, _grade, _harvest, _imagePath, _imageUrl;
  String _unit = 'quintal';
  double? _lat, _lng;
  bool _busy = false, _imageChanged = false, _authorized = false;

  @override
  void initState() {
    super.initState();
    final l = widget.listing;
    if (l != null) {
      _crop = cropTypes.contains(l.cropType) ? l.cropType : 'Other';
      if (_crop == 'Other') _customCrop.text = l.cropType;
      _variety.text = l.variety ?? '';
      _quantity.text = '${l.quantity}';
      _price.text = '${l.pricePerUnit}';
      _unit = listingUnits.contains(l.unit) ? l.unit : 'quintal';
      _kebele.text = l.kebele ?? '';
      _description.text = l.description ?? '';
      _grade = l.qualityGrade;
      _harvest = l.harvestDate;
      _lat = l.latitude;
      _lng = l.longitude;
      _imagePath = l.imagePath;
      _imageUrl = l.imageUrl;
    }
    _checkRole();
  }

  Future<void> _checkRole() async {
    final role = await const FlutterSecureStorage().read(key: 'user_role');
    final user = Supabase.instance.client.auth.currentUser;
    if (mounted) {
      setState(() => _authorized = role == 'farmer' &&
          user != null &&
          (widget.listing == null || widget.listing!.farmerId == user.id));
    }
  }

  void _message(String text) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  Future<void> _location() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _message('GPS is off. Enter your Kebele instead.');
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        _message('Location permission unavailable. Enter your Kebele instead.');
        return;
      }
      final p = await Geolocator.getCurrentPosition(
          locationSettings:
              const LocationSettings(timeLimit: Duration(seconds: 20)));
      if (mounted) {
        setState(() {
          _lat = p.latitude;
          _lng = p.longitude;
        });
      }
    } catch (_) {
      _message('GPS unavailable. You can save using your Kebele.');
    }
  }

  Future<void> _pick(ImageSource source) async {
    setState(() => _busy = true);
    try {
      final image = await ImagePicker().pickImage(source: source);
      if (image == null) return;
      final extension = image.path.split('.').last.toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].contains(extension)) {
        throw Exception('Unsupported image format');
      }
      final dir = await getApplicationDocumentsDirectory();
      final path = '${dir.path}/produce_${const Uuid().v4()}.jpg';
      String? compressed;
      for (final quality in [80, 60, 40, 25]) {
        final result = await FlutterImageCompress.compressAndGetFile(
            image.path, path,
            quality: quality,
            minWidth: quality <= 40 ? 800 : 1280,
            minHeight: quality <= 40 ? 600 : 960,
            format: CompressFormat.jpeg);
        if (result != null && await File(result.path).length() <= 204800) {
          compressed = result.path;
          break;
        }
      }
      if (compressed == null) {
        throw Exception(
            'Cannot compress this photo under 200 KB. Try a smaller image or continue without it.');
      }
      if (mounted) {
        setState(() {
          _imagePath = compressed;
          _imageChanged = true;
        });
      }
    } catch (e) {
      _message('Photo could not be added: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _date() async {
    final now = DateTime.now();
    final d = await showDatePicker(
        context: context,
        initialDate: DateTime.tryParse(_harvest ?? '') ?? now,
        firstDate: DateTime(1900),
        lastDate: now);
    if (d != null && mounted) {
      setState(() => _harvest =
          '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}');
    }
  }

  Future<void> _save() async {
    if (!_authorized || _busy || !_form.currentState!.validate()) return;
    // ListView can dispose off-screen FormFields. Validate all controller values
    // too, so an invalid draft can never enter the persistent offline queue.
    final crop = _crop == 'Other' ? _customCrop.text : _crop;
    final inputError = requiredText(crop) != null
        ? 'Select a crop or enter its name.'
        : requiredText(_variety.text) != null
            ? 'Crop variety is required.'
            : positiveNumber(_quantity.text) != null
                ? 'Quantity: enter a number greater than zero.'
                : positiveNumber(_price.text) != null
                    ? 'Price: enter a number greater than zero.'
                    : descriptionValidation(_description.text);
    if (inputError != null) {
      _message(inputError);
      return;
    }
    final locationError = locationValidation(_lat, _lng, _kebele.text);
    if (locationError != null) {
      _message(locationError);
      return;
    }
    if (widget.listing?.syncState == 'syncing') {
      _message('Please wait for synchronization to finish.');
      return;
    }
    setState(() => _busy = true);
    try {
      final l = widget.listing ??
          ListingModel(
              cropType: '',
              quantity: 1,
              pricePerUnit: 1,
              clientId: const Uuid().v4(),
              farmerId: Supabase.instance.client.auth.currentUser!.id);
      l.cropType = (_crop == 'Other' ? _customCrop.text : _crop!).trim();
      l.variety = _variety.text.trim();
      l.quantity = double.parse(_quantity.text);
      l.pricePerUnit = double.parse(_price.text);
      l.unit = _unit;
      l.latitude = _lat;
      l.longitude = _lng;
      l.kebele = _kebele.text.trim().isEmpty ? null : _kebele.text.trim();
      l.harvestDate = _harvest;
      l.qualityGrade = _grade;
      l.description = _description.text.isEmpty ? null : _description.text;
      if (_imageChanged) {
        l.imagePath = _imagePath;
        l.imageUrl = _imagePath == null ? null : _imageUrl;
        l.imagePending = _imagePath != null;
        l.imageId = const Uuid().v4();
      }
      if (l.imagePath != null && l.imageUrl == null) {
        l.imagePending = true;
      }
      l.queueChange();
      if (widget.listing == null) {
        await Hive.box<ListingModel>('listings').add(l);
      } else {
        await l.save();
      }
      _message('Saved locally. Will synchronize when the server is reachable.');
      SyncService().syncListings();
      if (mounted) {
        if (Navigator.canPop(context)) {
          Navigator.pop(context, true);
        } else {
          _form.currentState!.reset();
          _variety.clear();
          _quantity.clear();
          _price.clear();
          _description.clear();
          _customCrop.clear();
          setState(() {
            _crop = null;
            _harvest = null;
            _grade = null;
            _imagePath = null;
            _imageUrl = null;
            _imageChanged = false;
          });
        }
      }
    } catch (e) {
      _message('Could not save listing: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    for (final c in [
      _customCrop,
      _variety,
      _quantity,
      _price,
      _kebele,
      _description
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MarketplaceTheme(
          child: Scaffold(
        appBar: AppBar(
            title:
                Text(widget.listing == null ? 'Sell produce' : 'Edit Listing')),
        body: !_authorized
            ? const Center(
                child: Text('An authorized farmer account is required.'))
            : Center(
                child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 720),
                    child: Form(
                        key: _form,
                        child: ListView(
                            padding: const EdgeInsets.all(20),
                            children: [
                              MarketIntro(
                                  eyebrow: widget.listing == null
                                      ? 'From your farm to their table'
                                      : 'Keep buyers in the know',
                                  title: widget.listing == null
                                      ? 'Make your harvest visible.'
                                      : 'Refresh your listing.',
                                  subtitle:
                                      'Add clear details to help buyers find the right produce. Fields marked * are required.'),
                              const MarketNotice(
                                  message:
                                      'Save with or without a connection. Your listing syncs when the server is reachable.'),
                              _section('01', 'Crop details',
                                  'What are you bringing to market?'),
                              DropdownButtonFormField<String>(
                                  initialValue: _crop,
                                  decoration: const InputDecoration(
                                      labelText: 'Crop Type *'),
                                  items: cropTypes
                                      .map((v) => DropdownMenuItem(
                                          value: v, child: Text(v)))
                                      .toList(),
                                  onChanged: (v) => setState(() => _crop = v),
                                  validator: requiredText),
                              if (_crop == 'Other')
                                TextFormField(
                                    controller: _customCrop,
                                    maxLength: 80,
                                    decoration: const InputDecoration(
                                        labelText: 'Custom crop name *'),
                                    validator: requiredText),
                              TextFormField(
                                  controller: _variety,
                                  maxLength: 120,
                                  decoration: const InputDecoration(
                                      labelText: 'Crop Variety *'),
                                  validator: requiredText),
                              TextFormField(
                                  controller: _quantity,
                                  keyboardType:
                                      const TextInputType.numberWithOptions(
                                          decimal: true),
                                  decoration: const InputDecoration(
                                      labelText: 'Quantity *'),
                                  validator: positiveNumber),
                              DropdownButtonFormField<String>(
                                  initialValue: _unit,
                                  decoration: const InputDecoration(
                                      labelText: 'Quantity Unit *'),
                                  items: listingUnits
                                      .map((v) => DropdownMenuItem(
                                          value: v, child: Text(v)))
                                      .toList(),
                                  onChanged: (v) => setState(() => _unit = v!)),
                              TextFormField(
                                  controller: _price,
                                  keyboardType:
                                      const TextInputType.numberWithOptions(
                                          decimal: true),
                                  decoration: InputDecoration(
                                      labelText:
                                          'Asking Price — ETB per $_unit *'),
                                  validator: positiveNumber),
                              const MarketNotice(
                                  message:
                                      'Quantity and price use the selected unit. Changing units does not convert your values.'),
                              _section('02', 'Pickup location',
                                  'Help nearby buyers discover your produce.'),
                              Text(_lat == null
                                  ? 'No GPS captured. Enter a Kebele below.'
                                  : 'GPS: ${_lat!.toStringAsFixed(5)}, ${_lng!.toStringAsFixed(5)}'),
                              Wrap(children: [
                                TextButton.icon(
                                    onPressed: _location,
                                    icon: const Icon(Icons.my_location),
                                    label: const Text('Capture GPS')),
                                if (_lat != null)
                                  TextButton(
                                      onPressed: () => setState(() {
                                            _lat = null;
                                            _lng = null;
                                          }),
                                      child: const Text('Use Kebele only'))
                              ]),
                              TextFormField(
                                  controller: _kebele,
                                  maxLength: 160,
                                  decoration: const InputDecoration(
                                      labelText:
                                          'Kebele (required without GPS)'),
                                  validator: (v) =>
                                      locationValidation(_lat, _lng, v)),
                              _section('03', 'Make it stand out',
                                  'A photo and a few details go a long way. Optional.'),
                              ClipRRect(
                                  borderRadius: BorderRadius.circular(16),
                                  child: ProduceImage(
                                      cropType: _crop ?? 'Produce',
                                      localPath: _imagePath,
                                      imageUrl: _imageUrl,
                                      height: 180)),
                              Wrap(children: [
                                TextButton.icon(
                                    onPressed: _busy
                                        ? null
                                        : () => _pick(ImageSource.camera),
                                    icon: const Icon(Icons.camera_alt),
                                    label: const Text('Camera')),
                                TextButton.icon(
                                    onPressed: _busy
                                        ? null
                                        : () => _pick(ImageSource.gallery),
                                    icon: const Icon(Icons.photo_library),
                                    label: const Text('Gallery')),
                                TextButton(
                                    onPressed: () => setState(() {
                                          _imagePath = null;
                                          _imageUrl = null;
                                          _imageChanged = true;
                                        }),
                                    child: const Text('Remove image'))
                              ]),
                              const Text(
                                  'A clear photo helps buyers see the quality of your harvest.',
                                  style: TextStyle(
                                      color: marketMuted, fontSize: 12)),
                              ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(
                                      'Harvest Date: ${_harvest ?? 'Not provided'}'),
                                  onTap: _date,
                                  trailing: _harvest == null
                                      ? const Icon(Icons.calendar_today)
                                      : IconButton(
                                          onPressed: () =>
                                              setState(() => _harvest = null),
                                          icon: const Icon(Icons.clear))),
                              DropdownButtonFormField<String>(
                                  initialValue: _grade,
                                  decoration: const InputDecoration(
                                      labelText:
                                          'Farmer-reported Quality/Grade'),
                                  items: [
                                    const DropdownMenuItem<String>(
                                        value: null,
                                        child: Text('Not provided')),
                                    ...qualityGrades.entries.map((e) =>
                                        DropdownMenuItem(
                                            value: e.key, child: Text(e.value)))
                                  ],
                                  onChanged: (v) => setState(() => _grade = v)),
                              const Text(
                                  'Farmer-reported grade. Not independently verified or officially certified.',
                                  style: TextStyle(
                                      color: marketMuted, fontSize: 12)),
                              TextFormField(
                                  controller: _description,
                                  minLines: 3,
                                  maxLines: 6,
                                  maxLength: 500,
                                  decoration: const InputDecoration(
                                      labelText: 'Description'),
                                  validator: descriptionValidation),
                              const SizedBox(height: 16),
                              FilledButton.icon(
                                  onPressed: _busy ? null : _save,
                                  icon: const Icon(
                                      Icons.check_circle_outline_rounded),
                                  label: _busy
                                      ? const SizedBox(
                                          height: 20,
                                          width: 20,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2))
                                      : const Text(
                                          'Save listing (online or offline)')),
                              const Text(
                                  'You can review and update your listing in My Listings.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                      color: marketMuted, fontSize: 12)),
                            ]
                                .expand((child) =>
                                    [child, const SizedBox(height: 14)])
                                .toList())))),
      ));

  Widget _section(String number, String title, String subtitle) => Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 4),
        child: Row(children: [
          Container(
              width: 38,
              height: 38,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                  color: const Color(0xFFE3EDDF),
                  borderRadius: BorderRadius.circular(12)),
              child: Text(number,
                  style: const TextStyle(
                      color: marketGreen,
                      fontWeight: FontWeight.w800,
                      fontSize: 12))),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(title,
                    style: const TextStyle(
                        color: marketInk,
                        fontSize: 19,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 3),
                Text(subtitle,
                    style: const TextStyle(color: marketMuted, fontSize: 12))
              ])),
        ]),
      );
}
