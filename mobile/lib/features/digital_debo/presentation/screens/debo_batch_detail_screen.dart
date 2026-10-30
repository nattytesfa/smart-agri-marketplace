import 'package:flutter/material.dart';
import '../../../../data/remote/debo_api.dart';
import '../../../transactions_escrow/presentation/screens/payment_method_screen.dart';
import 'debo_join_confirmation_screen.dart';

class DeboBatchDetailScreen extends StatefulWidget {
  final String batchId;
  final DeboApi? api;
  const DeboBatchDetailScreen({super.key, required this.batchId, this.api});
  @override
  State<DeboBatchDetailScreen> createState() => _DeboBatchDetailScreenState();
}

class _DeboBatchDetailScreenState extends State<DeboBatchDetailScreen> {
  late final _api = widget.api ?? DeboApi();
  Map<String, dynamic>? _batch;
  String? _error;
  bool _busy = true;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final b = await _api.detail(widget.batchId);
      if (mounted) setState(() => _batch = b);
    } catch (e) {
      if (mounted) setState(() => _error = deboError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _manage(bool cancel) async {
    if (cancel) {
      final ok = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
                  title: const Text('Cancel this batch?'),
                  content: const Text(
                      'Confirmed reservations will be released. This cannot undo a fulfilled purchase.'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(c, false),
                        child: const Text('Keep batch')),
                    FilledButton(
                        onPressed: () => Navigator.pop(c, true),
                        child: const Text('Cancel batch'))
                  ]));
      if (ok != true || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (cancel) {
        await _api.cancel(widget.batchId);
      } else {
        await _api.refresh(widget.batchId);
      }
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = deboError(e);
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = _batch;
    return Scaffold(
        appBar: AppBar(title: const Text('Debo batch details'), actions: [
          IconButton(
              onPressed: _busy ? null : _load,
              icon: const Icon(Icons.refresh),
              tooltip: 'Refresh progress')
        ]),
        body: _busy
            ? const Center(child: CircularProgressIndicator())
            : ListView(padding: const EdgeInsets.all(16), children: [
                if (_error != null) ...[
                  Text(_error!, style: const TextStyle(color: Colors.red)),
                  TextButton(onPressed: _load, child: const Text('Retry'))
                ],
                if (b != null) ...[
                  SelectableText('Batch ${b['batch_id']}'),
                  Text('${b['crop_type']} • ${b['status']}',
                      style: Theme.of(context).textTheme.headlineSmall),
                  Text(
                      'Buyer: ${b['buyer_name'] ?? 'Buyer'}\nCreated: ${b['created_at']}\nExpires: ${b['expires_at']}'),
                  if (b['criteria'] is Map) ...[
                    Text(
                        'Preferred location: ${b['criteria']['preferred_location'] ?? 'Verified coordinates'} (${b['criteria']['lat']}, ${b['criteria']['lng']})\nSearch radius: ${deboQuantity(deboNumber(b['criteria']['radius']) / 1000)} km'),
                    if (b['criteria']['variety'] != null)
                      Text('Requested variety: ${b['criteria']['variety']}'),
                    if (b['criteria']['quality_grade'] != null)
                      Text(
                          'Requested grade: ${b['criteria']['quality_grade']}'),
                    if (b['criteria']['delivery_date'] != null)
                      Text(
                          'Requested delivery: ${b['criteria']['delivery_date']}'),
                    if (b['criteria']['notes'] != null)
                      Text('Request notes: ${b['criteria']['notes']}'),
                  ],
                  if (b['legacy'] == true)
                    const Text(
                        'Legacy batch: requires administrator review before purchase.'),
                  for (final key in [
                    'target_quantity',
                    'proposed_quantity',
                    'confirmed_quantity',
                    'reserved_quantity',
                    'fulfilled_quantity',
                    'remaining_quantity'
                  ])
                    Text(
                        '${key.replaceAll('_', ' ')}: ${deboQuantity(b[key])} ${b['unit']}'),
                  LinearProgressIndicator(
                      value: (deboNumber(b['completion_percentage']) / 100)
                          .clamp(0.0, 1.0)),
                  Text(
                      '${deboNumber(b['completion_percentage']).toStringAsFixed(1)}% committed'),
                  Text(
                      'Estimated total ETB ${deboNumber(b['estimated_total']).toStringAsFixed(2)}\nConfirmed total ETB ${deboNumber(b['confirmed_total']).toStringAsFixed(2)}'),
                  if (b['checkout'] is Map) ...[
                    Text(
                        'Checkout: ${b['checkout']['status']} • Payment: ${b['checkout']['payment_status']}\nMode: ${b['checkout']['mode']} • Deadline: ${b['checkout']['expires_at'] ?? 'Manual review required'}'),
                    if (b['checkout']['status'] == 'reconciliation_required')
                      const Text(
                          'Payment outcome is unresolved. Reservations remain held until reliable reconciliation. Contact the administrator.'),
                    if (b['checkout']['reason'] != null)
                      Text('${b['checkout']['reason']}'),
                  ],
                  const Divider(),
                  for (final l in b['listings'])
                    Card(
                        child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                      '${l['farmer_name'] ?? 'Farmer'} • ${l['participation_status']} / ${l['reservation_status']}'),
                                  Text(
                                      'Proposed ${deboQuantity(l['proposed_quantity'])}, confirmed ${deboQuantity(l['confirmed_quantity'])} ${l['unit']}'),
                                  Text(
                                      'ETB ${l['unit_price']} / ${l['unit']} • subtotal ETB ${deboNumber(l['subtotal']).toStringAsFixed(2)}'),
                                  if (l['distance_meters'] != null)
                                    Text(
                                        '${(deboNumber(l['distance_meters']) / 1000).toStringAsFixed(2)} km from requested location'),
                                  if (b['can_manage'] != true &&
                                      l['participation_status'] == 'proposed' &&
                                      b['status'] == 'pending')
                                    FilledButton(
                                        onPressed: () async {
                                          await Navigator.push(
                                              context,
                                              MaterialPageRoute(
                                                  builder: (_) =>
                                                      DeboJoinConfirmationScreen(
                                                          batchId:
                                                              widget.batchId,
                                                          contribution: Map<
                                                              String,
                                                              dynamic>.from(l),
                                                          api: _api)));
                                          if (mounted) _load();
                                        },
                                        child: const Text('Review invitation')),
                                ]))),
                  if (b['can_manage'] == true &&
                      b['status'] == 'pending' &&
                      b['legacy'] != true)
                    OutlinedButton(
                        onPressed: () => _manage(false),
                        child:
                            const Text('Find replacement / additional supply')),
                  if (b['can_manage'] == true &&
                      ['pending', 'filled'].contains(b['status']) &&
                      b['legacy'] != true)
                    TextButton(
                        onPressed: () => _manage(true),
                        child: const Text('Cancel batch & release stock')),
                  if (b['can_manage'] == true &&
                      b['transaction_ready'] == true) ...[
                    const Text(
                        'Ready for transaction review. Payments are prototype-only: no real funds are collected. Multi-farmer payout is not yet supported by the existing single-payee escrow service.'),
                    if ((b['listings'] as List)
                            .where((l) => l['reservation_status'] == 'active')
                            .map((l) => l['farmer_id'])
                            .toSet()
                            .length ==
                        1)
                      FilledButton(
                          onPressed: () async {
                            await Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) => PaymentScreen(
                                        listingId: widget.batchId,
                                        farmerId: '',
                                        amount:
                                            deboNumber(b['confirmed_total']),
                                        cropType: b['crop_type'],
                                        isBatch: true)));
                            if (mounted) _load();
                          },
                          child: const Text('Review prototype payment')),
                  ],
                  const Text(
                      'Refresh to see new confirmations. Only successful reservations count toward batch completion.'),
                ],
              ]));
  }
}
