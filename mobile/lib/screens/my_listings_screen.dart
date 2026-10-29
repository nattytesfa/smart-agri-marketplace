import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../data/models/listing_model.dart';
import '../data/repositories/listing_repository.dart';
import '../services/sync_service.dart';
import '../features/listings/presentation/widgets/listing_card.dart';
import '../features/listings/presentation/screens/listing_detail_screen.dart';
import '../features/listings/presentation/screens/listing_create_screen.dart';
import '../features/listings/presentation/widgets/marketplace_ui.dart';

class MyListingsScreen extends StatefulWidget {
  const MyListingsScreen({super.key});
  @override
  State<MyListingsScreen> createState() => _MyListingsScreenState();
}

class _MyListingsScreenState extends State<MyListingsScreen> {
  final _repository = ListingRepository();
  String? _error;
  bool _loading = false;
  String _filter = 'All';

  Future<void> _create() => Navigator.push(context,
      MaterialPageRoute<void>(builder: (_) => const ListingCreateScreen()));
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
  Widget build(BuildContext context) => MarketplaceTheme(
          child: Scaffold(
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
        body: Center(
            child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 960),
                child: Column(children: [
                  if (_loading) const LinearProgressIndicator(),
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.all(16),
                        child: MarketNotice(message: _error!, warning: true)),
                  Expanded(
                      child: ValueListenableBuilder<Box<ListingModel>>(
                          valueListenable: _repository.box.listenable(),
                          builder: (context, box, _) {
                            final listings = box.values
                                .where((l) => l.farmerId == _repository.owner)
                                .toList()
                              ..sort(
                                  (a, b) => b.createdAt.compareTo(a.createdAt));
                            final visible = listings
                                .where((l) =>
                                    _filter == 'All' ||
                                    (_filter == 'Pending'
                                        ? l.syncStatus != 'cloud'
                                        : l.status == _filter.toLowerCase()))
                                .toList();
                            return RefreshIndicator(
                                onRefresh: _refresh,
                                child: ListView.builder(
                                    padding: const EdgeInsets.all(20),
                                    physics:
                                        const AlwaysScrollableScrollPhysics(),
                                    itemCount: visible.length + 1,
                                    itemBuilder: (_, i) {
                                      if (i == 0) {
                                        return Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              const MarketIntro(
                                                  eyebrow:
                                                      'Your farm, your business',
                                                  title: 'Manage your harvest.',
                                                  subtitle:
                                                      'Keep your produce up to date and ready for buyers.'),
                                              const SizedBox(height: 22),
                                              Row(children: [
                                                _stat('Total', listings.length,
                                                    Icons.inventory_2_outlined),
                                                const SizedBox(width: 10),
                                                _stat(
                                                    'Available',
                                                    listings
                                                        .where((l) =>
                                                            l.status ==
                                                                'available' &&
                                                            !l.deleted)
                                                        .length,
                                                    Icons.eco_outlined),
                                                const SizedBox(width: 10),
                                                _stat(
                                                    'Sold',
                                                    listings
                                                        .where((l) =>
                                                            l.status == 'sold')
                                                        .length,
                                                    Icons.check_circle_outline),
                                              ]),
                                              const SizedBox(height: 20),
                                              SizedBox(
                                                  width: double.infinity,
                                                  child: FilledButton.icon(
                                                      onPressed: _create,
                                                      icon: const Icon(
                                                          Icons.add_rounded),
                                                      label: const Text(
                                                          'Create a listing'))),
                                              const SizedBox(height: 16),
                                              const MarketNotice(
                                                  message:
                                                      'Works offline, too. Saved changes sync when the server is reachable.'),
                                              const SizedBox(height: 16),
                                              SingleChildScrollView(
                                                  scrollDirection:
                                                      Axis.horizontal,
                                                  child: Row(
                                                      children: [
                                                    'All',
                                                    'Available',
                                                    'Reserved',
                                                    'Sold',
                                                    'Pending'
                                                  ]
                                                          .map((v) => Padding(
                                                              padding:
                                                                  const EdgeInsets.only(
                                                                      right: 8),
                                                              child: ChoiceChip(
                                                                  label:
                                                                      Text(v),
                                                                  selected:
                                                                      _filter ==
                                                                          v,
                                                                  showCheckmark:
                                                                      false,
                                                                  onSelected: (_) =>
                                                                      setState(() =>
                                                                          _filter =
                                                                              v))))
                                                          .toList())),
                                              const SizedBox(height: 16),
                                              if (visible.isEmpty)
                                                MarketEmpty(
                                                    icon: Icons
                                                        .storefront_outlined,
                                                    title: listings.isEmpty
                                                        ? 'Your harvest belongs here'
                                                        : 'Nothing here yet',
                                                    message: listings.isEmpty
                                                        ? 'Create your first listing and help buyers discover what you grow.'
                                                        : 'Listings with this status will appear here.'),
                                            ]);
                                      }
                                      final listing = visible[i - 1];
                                      return ListingCard(
                                          listing: listing,
                                          showSync: true,
                                          onTap: () => Navigator.push(
                                              context,
                                              MaterialPageRoute(
                                                  builder: (_) =>
                                                      ListingDetailScreen(
                                                          listing: listing,
                                                          owner: true))));
                                    }));
                          })),
                ]))),
      ));

  Widget _stat(String label, int value, IconData icon) => Expanded(
          child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 16),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE2E8DF))),
        child: Column(children: [
          Icon(icon, color: marketGreen, size: 22),
          const SizedBox(height: 8),
          Text('$value',
              style: const TextStyle(
                  fontSize: 25, fontWeight: FontWeight.w800, color: marketInk)),
          const SizedBox(height: 3),
          Text(label, style: const TextStyle(fontSize: 11, color: marketMuted))
        ]),
      ));
}
