import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../../data/models/listing_model.dart';
import '../../../../data/models/listing_validation.dart';
import '../../../../data/remote/listings_api.dart';
import '../../../../services/sync_service.dart';
import '../../../transactions_escrow/presentation/screens/payment_method_screen.dart';
import '../widgets/listing_card.dart';
import '../widgets/marketplace_ui.dart';
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
    final canBuy = _buyer &&
        !widget.owner &&
        !l.deleted &&
        l.status == 'available' &&
        l.id != null &&
        l.farmerId != null;
    final total = l.quantity * l.pricePerUnit;
    return MarketplaceTheme(
        child: Scaffold(
            appBar: AppBar(title: const Text('Produce details')),
            bottomNavigationBar: canBuy
                ? Container(
                    decoration: const BoxDecoration(
                        color: Colors.white,
                        border:
                            Border(top: BorderSide(color: Color(0xFFE2E8DF)))),
                    child: SafeArea(
                        top: false,
                        child: Center(
                            heightFactor: 1,
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 760),
                              child: Padding(
                                  padding:
                                      const EdgeInsets.fromLTRB(20, 14, 20, 16),
                                  child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Row(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              const Expanded(
                                                  child: Text(
                                                      'Full listing total',
                                                      style: TextStyle(
                                                          color: marketMuted,
                                                          fontSize: 12))),
                                              Flexible(
                                                  child: Text(
                                                      'ETB ${_number(total)}',
                                                      textAlign: TextAlign.end,
                                                      style: const TextStyle(
                                                          color: marketGreen,
                                                          fontSize: 22,
                                                          fontWeight: FontWeight
                                                              .w800))),
                                            ]),
                                        const SizedBox(height: 10),
                                        SizedBox(
                                            width: double.infinity,
                                            child: FilledButton.icon(
                                              onPressed: () => Navigator.push(
                                                  context,
                                                  MaterialPageRoute(
                                                      builder: (_) =>
                                                          PaymentScreen(
                                                              listingId: l.id!,
                                                              farmerId:
                                                                  l.farmerId!,
                                                              amount: total,
                                                              cropType:
                                                                  l.cropType))),
                                              icon: const Icon(
                                                  Icons.shopping_bag_outlined,
                                                  size: 20),
                                              label: const Text(
                                                  'Buy full listing'),
                                            )),
                                        const SizedBox(height: 8),
                                        const Text(
                                            'Purchase the entire quantity listed above.',
                                            style: TextStyle(
                                                color: marketMuted,
                                                fontSize: 11)),
                                      ])),
                            ))),
                  )
                : null,
            body: Center(
                child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 760),
                    child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                        children: [
                          ClipRRect(
                              borderRadius: BorderRadius.circular(24),
                              child: SizedBox(
                                  width: double.infinity,
                                  child: ProduceImage(
                                      cropType: l.cropType,
                                      imageUrl: l.imageUrl,
                                      localPath: l.imagePath,
                                      height: 260))),
                          const SizedBox(height: 22),
                          Wrap(spacing: 8, runSpacing: 8, children: [
                            _badge(
                                l.deleted
                                    ? 'REMOVAL PENDING'
                                    : l.status.toUpperCase(),
                                l.status == 'available' && !l.deleted
                                    ? marketGreen
                                    : marketMuted),
                            if (widget.owner)
                              _badge('YOUR LISTING', marketMuted),
                          ]),
                          const SizedBox(height: 12),
                          Text(l.cropType,
                              style: const TextStyle(
                                  color: marketInk,
                                  fontSize: 32,
                                  height: 1.1,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -.8)),
                          if (l.variety?.trim().isNotEmpty == true) ...[
                            const SizedBox(height: 7),
                            Text(l.variety!,
                                style: const TextStyle(
                                    color: marketMuted, fontSize: 16)),
                          ],
                          const SizedBox(height: 18),
                          Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                  color: const Color(0xFFEAF1E6),
                                  borderRadius: BorderRadius.circular(20)),
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('ASKING PRICE',
                                        style: TextStyle(
                                            color: marketGreen,
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            letterSpacing: 1.4)),
                                    const SizedBox(height: 8),
                                    Text.rich(TextSpan(children: [
                                      TextSpan(
                                          text:
                                              'ETB ${_number(l.pricePerUnit)}',
                                          style: const TextStyle(
                                              fontSize: 28,
                                              fontWeight: FontWeight.w800,
                                              color: marketGreen)),
                                      TextSpan(
                                          text: ' / ${l.unit}',
                                          style: const TextStyle(
                                              fontSize: 14,
                                              color: marketMuted)),
                                    ])),
                                    const SizedBox(height: 14),
                                    Row(children: [
                                      const Icon(Icons.inventory_2_outlined,
                                          size: 17, color: marketGreen),
                                      const SizedBox(width: 8),
                                      Expanded(
                                          child: Text(
                                              '${_number(l.quantity)} ${l.unit} listed',
                                              style: const TextStyle(
                                                  color: marketGreen,
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w600)))
                                    ]),
                                  ])),
                          const SizedBox(height: 20),
                          _panel('Harvest details', Icons.eco_outlined, [
                            _detail('Crop', l.cropType),
                            if (l.variety?.trim().isNotEmpty == true)
                              _detail('Variety', l.variety!),
                            _detail(
                                'Quantity', '${_number(l.quantity)} ${l.unit}'),
                            _detail(
                                'Harvested',
                                l.harvestDate == null
                                    ? 'Not provided'
                                    : _dateLabel(l.harvestDate!)),
                            _detail(
                                'Listed on',
                                _dateLabel(
                                    l.createdAt.toLocal().toIso8601String())),
                            if (l.qualityGrade != null) ...[
                              _detail(
                                  'Reported grade',
                                  qualityGrades[l.qualityGrade] ??
                                      l.qualityGrade!),
                              const SizedBox(height: 8),
                              const MarketNotice(
                                  message:
                                      'Quality is farmer-reported, not independently verified or officially certified.'),
                            ],
                          ]),
                          const SizedBox(height: 16),
                          _panel(
                              'Pickup location', Icons.location_on_outlined, [
                            Text(
                                l.kebele ??
                                    (l.latitude != null
                                        ? 'GPS location provided'
                                        : 'Location not provided'),
                                style: const TextStyle(
                                    color: marketInk,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600)),
                            const SizedBox(height: 8),
                            Text(
                                l.latitude != null && l.longitude != null
                                    ? '${l.latitude!.toStringAsFixed(5)}, ${l.longitude!.toStringAsFixed(5)}'
                                    : 'Administrative location only. Precise distance is unavailable.',
                                style: const TextStyle(
                                    color: marketMuted,
                                    fontSize: 12,
                                    height: 1.5)),
                          ]),
                          const SizedBox(height: 16),
                          _panel('Listed by', Icons.person_outline_rounded, [
                            Row(children: [
                              Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: const BoxDecoration(
                                      color: Color(0xFFEAF1E6),
                                      shape: BoxShape.circle),
                                  child: const Icon(Icons.agriculture_outlined,
                                      color: marketGreen, size: 24)),
                              const SizedBox(width: 12),
                              Expanded(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    Text(
                                        l.farmerName?.trim().isNotEmpty == true
                                            ? l.farmerName!
                                            : 'Marketplace farmer',
                                        style: const TextStyle(
                                            color: marketInk,
                                            fontSize: 16,
                                            fontWeight: FontWeight.w700)),
                                    const SizedBox(height: 4),
                                    const Text('Produce seller',
                                        style: TextStyle(
                                            color: marketMuted, fontSize: 12)),
                                  ])),
                            ]),
                          ]),
                          if (l.description?.trim().isNotEmpty == true) ...[
                            const SizedBox(height: 16),
                            _panel('About this produce', Icons.notes_rounded, [
                              Text(l.description!,
                                  style: const TextStyle(
                                      color: marketInk,
                                      fontSize: 14,
                                      height: 1.7))
                            ]),
                          ],
                          if (widget.owner) ...[
                            const SizedBox(height: 24),
                            const Text('Manage listing',
                                style: TextStyle(
                                    color: marketInk,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w700)),
                            const SizedBox(height: 12),
                            MarketNotice(
                                message: 'Synchronization: ${l.syncLabel}',
                                warning: l.syncState == 'failed'),
                            const SizedBox(height: 12),
                            if (l.syncError != null)
                              Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: MarketNotice(
                                      message: l.syncError!, warning: true)),
                            if (l.syncError?.startsWith('Conflict:') == true)
                              OutlinedButton(
                                  onPressed: _busy ? null : _refreshConflict,
                                  child: const Text(
                                      'Review server version (discard local changes)')),
                            FilledButton.icon(
                                onPressed: canEdit
                                    ? () async {
                                        await Navigator.push(
                                            context,
                                            MaterialPageRoute(
                                                builder: (_) =>
                                                    ListingCreateScreen(
                                                        listing: l)));
                                        if (mounted) setState(() {});
                                      }
                                    : null,
                                icon: const Icon(Icons.edit_outlined, size: 19),
                                label: const Text('Edit listing')),
                            const SizedBox(height: 8),
                            OutlinedButton(
                                style: OutlinedButton.styleFrom(
                                    foregroundColor: const Color(0xFFB4483F)),
                                onPressed: canEdit ? _delete : null,
                                child: const Text('Delete')),
                            OutlinedButton(
                                onPressed: l.syncState == 'syncing'
                                    ? null
                                    : () async {
                                        await SyncService()
                                            .syncListings(retry: true);
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
                          if (!widget.owner &&
                              !canBuy &&
                              l.status != 'available') ...[
                            const SizedBox(height: 20),
                            MarketNotice(
                                message:
                                    'This listing is ${l.status} and is not currently available to purchase.',
                                warning: true),
                          ],
                        ])))));
  }

  String _number(double value) =>
      value.toString().replaceFirst(RegExp(r'\.0$'), '');

  String _dateLabel(String value) {
    final date = DateTime.tryParse(value);
    if (date == null) return value;
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${date.day} ${months[date.month - 1]} ${date.year}';
  }

  Widget _badge(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
            color: color.withAlpha(18), borderRadius: BorderRadius.circular(8)),
        child: Text(text,
            style: TextStyle(
                color: color,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: .7)),
      );

  Widget _panel(String title, IconData icon, List<Widget> children) =>
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE2E8DF))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, color: marketGreen, size: 20),
            const SizedBox(width: 10),
            Expanded(
                child: Text(title,
                    style: const TextStyle(
                        color: marketInk,
                        fontSize: 17,
                        fontWeight: FontWeight.w700)))
          ]),
          const SizedBox(height: 18),
          ...children,
        ]),
      );

  Widget _detail(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
              child: Text(label,
                  style: const TextStyle(color: marketMuted, fontSize: 13))),
          const SizedBox(width: 12),
          Expanded(
              child: Text(value,
                  textAlign: TextAlign.end,
                  style: const TextStyle(
                      color: marketInk,
                      fontSize: 13,
                      fontWeight: FontWeight.w600))),
        ]),
      );
}
