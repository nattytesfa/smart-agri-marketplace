import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../../data/models/listing_model.dart';
import '../../../../data/models/listing_validation.dart';
import '../../../../data/remote/listings_api.dart';
import '../../../../services/sync_service.dart';
import '../../../transactions_escrow/presentation/screens/payment_method_screen.dart';
import '../widgets/listing_card.dart';
import 'listing_create_screen.dart';

class ListingDetailScreen extends StatefulWidget {
  const ListingDetailScreen(
      {super.key, required this.listing, this.owner = false});
  final ListingModel listing;
  final bool owner;
  @override
  State<ListingDetailScreen> createState() => _ListingDetailScreenState();
}

class _ListingDetailScreenState extends State<ListingDetailScreen> {
  bool _buyer = false, _busy = false;
  @override
  void initState() {
    super.initState();
    _role();
  }

  Future<void> _role() async {
    final role = await const FlutterSecureStorage().read(key: 'user_role');
    if (mounted) setState(() => _buyer = role == 'buyer');
  }

  Future<bool> _confirm(String title, String message) async =>
      await showDialog<bool>(
          context: context,
          builder: (c) =>
              AlertDialog(title: Text(title), content: Text(message), actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('Cancel')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, true),
                    child: const Text('Confirm')),
              ])) ??
      false;
  Future<void> _delete() async {
    if (!await _confirm('Delete listing?',
        'Remove this listing? If offline, removal will synchronize later.')) {
      return;
    }
    final l = widget.listing;
    if (l.syncState == 'syncing') return;
    if (l.id == null && !l.uploadAttempted && l.attempts == 0) {
      await l.delete();
    } else {
      l.deleted = true;
      l.syncStatus = 'local';
      l.syncState = 'pending';
      l.syncError = null;
      l.nextAttempt = null;
      await l.save();
    }
    SyncService().syncListings(retry: true);
    if (mounted) Navigator.pop(context);
  }

  Future<void> _refreshConflict() async {
    if (!await _confirm('Use server version?',
        'This discards your pending local changes. Review the server version, then edit again.')) {
      return;
    }
    setState(() => _busy = true);
    try {
      if (widget.listing.id == null) {
        await widget.listing.delete();
        if (mounted) Navigator.pop(context);
        return;
      }
      final response = await listingApi().get('/listings/${widget.listing.id}');
      final remote = ListingModel.fromJson(
          Map<String, dynamic>.from(response.data['listing']));
      await widget.listing.box!.put(widget.listing.key, remote);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (e is DioException && e.response?.statusCode == 404) {
        await widget.listing.delete();
        if (mounted) Navigator.pop(context);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('Could not refresh. Your local changes are preserved.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.listing;
    final canEdit = widget.owner &&
        !l.deleted &&
        l.syncError?.startsWith('Conflict:') != true &&
        l.status == 'available' &&
        l.syncState != 'syncing' &&
        !_busy;
    return Scaffold(
        appBar: AppBar(title: Text('${l.cropType} details')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          ProduceImage(
              cropType: l.cropType,
              imageUrl: l.imageUrl,
              localPath: l.imagePath,
              height: 220),
          Text('${l.cropType} — ${l.variety ?? ''}',
              style: Theme.of(context).textTheme.headlineSmall),
          Text('${l.quantity} ${l.unit}'),
          Text('ETB ${l.pricePerUnit} per ${l.unit}'),
          Text('Location: ${l.kebele ?? 'GPS location'}'),
          if (l.latitude != null) Text('GPS: ${l.latitude}, ${l.longitude}'),
          if (l.latitude == null)
            const Text(
                'Administrative location only; precise distance unavailable.'),
          Text('Farmer: ${l.farmerName ?? 'Marketplace farmer'}'),
          Text('Availability: ${l.status}'),
          Text('Created: ${l.createdAt.toLocal()}'),
          if (l.harvestDate != null) Text('Harvest date: ${l.harvestDate}'),
          if (l.qualityGrade != null)
            Text(
                'Farmer-reported quality: ${qualityGrades[l.qualityGrade]} (not independently verified)'),
          if (l.description != null)
            Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(l.description!)),
          if (widget.owner) ...[
            Text('Synchronization: ${l.syncLabel}'),
            if (l.syncError != null)
              Text(l.syncError!, style: const TextStyle(color: Colors.red)),
            if (l.syncError?.startsWith('Conflict:') == true)
              OutlinedButton(
                  onPressed: _busy ? null : _refreshConflict,
                  child: const Text(
                      'Review server version (discard local changes)')),
            FilledButton(
                onPressed: canEdit
                    ? () async {
                        await Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) =>
                                    ListingCreateScreen(listing: l)));
                        if (mounted) setState(() {});
                      }
                    : null,
                child: const Text('Edit')),
            OutlinedButton(
                onPressed: canEdit ? _delete : null,
                child: const Text('Delete')),
            OutlinedButton(
                onPressed: l.syncState == 'syncing'
                    ? null
                    : () async {
                        await SyncService().syncListings(retry: true);
                        if (mounted) setState(() {});
                      },
                child: const Text('Retry Sync')),
            if (canEdit && l.syncStatus == 'cloud')
              OutlinedButton(
                  onPressed: () async {
                    if (!await _confirm('Mark as sold?',
                        'This removes the listing from available produce. Reserved listings are managed by transactions.')) {
                      return;
                    }
                    l.status = 'sold';
                    l.queueChange();
                    await l.save();
                    SyncService().syncListings();
                    if (context.mounted) Navigator.pop(context);
                  },
                  child: const Text('Mark as sold')),
          ],
          if (_buyer &&
              !widget.owner &&
              l.status == 'available' &&
              l.id != null &&
              l.farmerId != null)
            FilledButton(
                onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => PaymentScreen(
                            listingId: l.id!,
                            farmerId: l.farmerId!,
                            amount: l.quantity * l.pricePerUnit,
                            cropType: l.cropType))),
                child: Text(
                    'Buy full listing — ETB ${l.quantity * l.pricePerUnit}')),
        ]));
  }
}
