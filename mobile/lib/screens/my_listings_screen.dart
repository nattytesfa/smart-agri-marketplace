import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../data/models/listing_model.dart';
import '../data/repositories/listing_repository.dart';
import '../services/sync_service.dart';
import '../features/listings/presentation/widgets/listing_card.dart';
import '../features/listings/presentation/screens/listing_detail_screen.dart';
import '../features/listings/presentation/screens/listing_create_screen.dart';

class MyListingsScreen extends StatefulWidget {
  const MyListingsScreen({super.key});
  @override
  State<MyListingsScreen> createState() => _MyListingsScreenState();
}

class _MyListingsScreenState extends State<MyListingsScreen> {
  final _repository = ListingRepository();
  String? _error;
  bool _loading = false;
  Future<void> _recoverDrafts() async {
    final drafts = _repository.box.values
        .where((l) => l.farmerId == null && l.syncStatus == 'local')
        .toList();
    for (final l in drafts) {
      if (!mounted) return;
      final claim = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
                  title: const Text('Recover older local draft?'),
                  content: Text(
                      '${l.cropType} — ${l.quantity} ${l.unit}\nThis older draft has no recorded owner. Confirm it belongs to you, then review its required fields before saving.'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(c, false),
                        child: const Text('Skip')),
                    FilledButton(
                        onPressed: () => Navigator.pop(c, true),
                        child: const Text('This is my draft'))
                  ]));
      if (claim == true && mounted) {
        // Ownership is assigned only after review; never auto-sync unknown legacy data.
        l.farmerId = _repository.owner;
        l.syncState = 'review';
        await l.save();
        if (!mounted) return;
        await Navigator.push(context,
            MaterialPageRoute(builder: (_) => ListingCreateScreen(listing: l)));
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await SyncService().syncListings(retry: true);
      await _repository.refresh();
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Server unavailable. Showing saved listings.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('My Listings'), actions: [
          IconButton(
              tooltip: 'Retry Sync / Refresh',
              onPressed: _loading ? null : _refresh,
              icon: const Icon(Icons.sync)),
          IconButton(
              tooltip: 'Recover older local drafts',
              onPressed: _recoverDrafts,
              icon: const Icon(Icons.restore)),
          IconButton(
              tooltip: 'Create listing',
              onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const ListingCreateScreen())),
              icon: const Icon(Icons.add)),
        ]),
        body: Column(children: [
          if (_loading) const LinearProgressIndicator(),
          if (_error != null)
            Padding(padding: const EdgeInsets.all(8), child: Text(_error!)),
          Expanded(
              child: ValueListenableBuilder<Box<ListingModel>>(
                  valueListenable: _repository.box.listenable(),
                  builder: (context, box, _) {
                    final listings = box.values
                        .where((l) => l.farmerId == _repository.owner)
                        .toList()
                      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
                    if (listings.isEmpty) {
                      return const Center(
                          child: Text(
                              'No listings yet. Tap + to create a listing, even offline.'));
                    }
                    return RefreshIndicator(
                        onRefresh: _refresh,
                        child: ListView.builder(
                            itemCount: listings.length,
                            itemBuilder: (_, i) => ListingCard(
                                listing: listings[i],
                                showSync: true,
                                onTap: () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                        builder: (_) => ListingDetailScreen(
                                            listing: listings[i],
                                            owner: true))))));
                  })),
        ]),
      );
}
