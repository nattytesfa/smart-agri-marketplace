import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../../../../core/platform/telebirr_sdk.dart';
import '../../../../data/remote/telebirr_api.dart';
import '../../../../data/remote/transactions_api.dart';

class TelebirrFundingScreen extends StatefulWidget {
  const TelebirrFundingScreen({super.key, this.api, this.sdk});
  final TelebirrApi? api;
  final TelebirrSdk? sdk;
  @override
  State<TelebirrFundingScreen> createState() => _TelebirrFundingScreenState();
}

class _TelebirrFundingScreenState extends State<TelebirrFundingScreen>
    with WidgetsBindingObserver {
  late final _api = widget.api ?? TelebirrApi();
  late final _sdk = widget.sdk ?? TelebirrSdk();
  final _amount = TextEditingController();
  final _form = GlobalKey<FormState>();
  Map<String, dynamic>? _capabilities, _current;
  final List<Map<String, dynamic>> _history = [];
  bool _busy = false, _host = false, _more = false;
  String? _error, _key, _retryAmount, _interaction;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _amount.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_busy) _load();
  }

  Future<void> _load({bool next = false}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final caps = await _api.capabilities();
      final history = await _api.history(next ? _history.length : 0);
      final host = await _sdk.available();
      if (!mounted) return;
      setState(() {
        _capabilities = caps;
        _host = host;
        if (!next) _history.clear();
        _history.addAll(List<Map<String, dynamic>>.from(history['items']));
        _more = history['has_more'] == true;
      });
    } catch (e) {
      if (mounted) setState(() => _error = TransactionsApi.error(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _create() async {
    if (!_form.currentState!.validate()) return;
    final amount = _amount.text.trim();
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Confirm Telebirr UAT payment'),
                content: Text(
                    'Request ETB $amount in Telebirr Sandbox? This does not add spendable Demo Wallet funds. SDK authorization is UAT-only and is not proof of payment. Independent provider verification is still required.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Create UAT order'))
                ]));
    if (confirmed != true || !mounted) return;
    // Retain the key on ambiguous network errors. Backend history is durable
    // across process death; reopening never silently launches an old attempt.
    if (_retryAmount != amount) {
      _key = const Uuid().v4();
      _retryAmount = amount;
    }
    setState(() {
      _busy = true;
      _error = null;
      _interaction = null;
    });
    try {
      var row = await _api.create(amount, _key!);
      if (!mounted) return;
      setState(() => _current = row);
      final launch = row['sdk_launch'];
      if (launch is Map &&
          _capabilities?['sdk_launch_enabled'] == true &&
          _host) {
        try {
          final result = await _sdk.start(
              row['funding_id'], Map<String, dynamic>.from(launch));
          if (mounted) {
            setState(() => _interaction = result['outcome']?.toString());
          }
        } catch (_) {
          if (mounted) {
            setState(() => _interaction = 'SDK unavailable or interrupted');
          }
        } finally {
          // SDK status never changes a balance or authoritatively finalizes UI.
          row = await _api.verify(row['funding_id'], interactionEnded: true);
        }
      }
      if (mounted) setState(() => _current = row);
    } catch (e) {
      if (mounted) setState(() => _error = TransactionsApi.error(e));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        await _load();
      }
    }
  }

  Future<void> _verify(Map<String, dynamic> row) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _api.verify(row['funding_id']);
      if (mounted) setState(() => _current = result);
    } catch (e) {
      if (mounted) setState(() => _error = TransactionsApi.error(e));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        await _load();
      }
    }
  }

  String _label(dynamic status) => switch (status) {
        'pending' => 'Pending',
        'awaiting_authorization' => 'Awaiting Authorization',
        'verification_pending' => 'Verification Pending',
        'verified_success' => 'Verified Success',
        'failed' => 'Failed',
        'cancelled' => 'Cancelled',
        'expired' => 'Expired',
        _ => 'Reconciliation Required',
      };

  Widget _record(Map<String, dynamic> row) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('ETB ${row['amount']} · ${_label(row['status'])}',
                style: Theme.of(context).textTheme.titleMedium),
            Text('UAT only · ${row['created_at']}'),
            SelectableText('Funding ID: ${row['funding_id']}'),
            if (row['provider_reference'] != null)
              SelectableText(
                  'Preorder reference: ${row['provider_reference']}'),
            if (row['reconciliation_reason'] != null)
              Text(row['reconciliation_reason'].toString()),
            const Text(
                'Not spendable. No Demo Wallet credit or real-money escrow.'),
            TextButton(
                onPressed: _busy ? null : () => _verify(row),
                child: const Text('Check provider verification')),
          ])));

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Telebirr Sandbox'), actions: [
        IconButton(
            onPressed: _busy ? null : _load, icon: const Icon(Icons.refresh))
      ]),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Telebirr UAT Payment',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        const Text(
            'Sandbox records are separate from free Demo Funds and simulated escrow. No real withdrawals or automatic conversion.'),
        if (_capabilities != null) ...[
          Text(
              'Preorder: ${_capabilities!['preorder_enabled'] == true ? 'configured' : 'not configured'}'),
          Text(_capabilities!['blocker'].toString()),
        ],
        Text(_sdk.supported
            ? (_host
                ? 'UAT host available'
                : 'Compatible official Telebirr UAT testbed not installed')
            : 'SDK authorization requires Android'),
        if (_busy) const LinearProgressIndicator(),
        if (_error != null)
          Text(_error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
        Form(
            key: _form,
            child: TextFormField(
                controller: _amount,
                enabled: !_busy,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                    labelText: 'Amount (ETB)',
                    helperText: 'Payment method: Telebirr Sandbox'),
                validator: (value) {
                  final text = (value ?? '').trim();
                  if (!RegExp(r'^\d{1,7}(\.\d{1,2})?$').hasMatch(text)) {
                    return 'Enter a positive amount with at most two decimals';
                  }
                  final pieces = text.split('.');
                  final cents = BigInt.parse(pieces[0]) * BigInt.from(100) +
                      BigInt.parse(pieces.length == 1
                          ? '0'
                          : pieces[1].padRight(2, '0'));
                  if (cents <= BigInt.zero || cents > BigInt.from(100000000)) {
                    return 'Amount must be between ETB 0.01 and 1000000.00';
                  }
                  return null;
                })),
        const SizedBox(height: 12),
        FilledButton(
            onPressed: _busy || _capabilities?['preorder_enabled'] != true
                ? null
                : _create,
            child: const Text('Review UAT funding request')),
        if (_interaction != null)
          Text('SDK interaction: $_interaction (not payment proof)'),
        if (_current != null) _record(_current!),
        const SizedBox(height: 20),
        Text('UAT funding history',
            style: Theme.of(context).textTheme.titleLarge),
        if (_history.isEmpty && !_busy) const Text('No UAT funding attempts.'),
        ..._history.map(_record),
        if (_more)
          TextButton(
              onPressed: _busy ? null : () => _load(next: true),
              child: const Text('Load more UAT attempts')),
      ]));
}
