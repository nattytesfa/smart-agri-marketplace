import 'dart:async';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import 'package:dio/dio.dart';
import '../../../../data/remote/telebirr_demo_api.dart';
import '../../../../data/remote/transactions_api.dart';

class TelebirrDemoScreen extends StatefulWidget {
  const TelebirrDemoScreen({super.key, this.api, this.payment});
  final TelebirrDemoApi? api;
  final Map<String, dynamic>? payment;
  @override
  State<TelebirrDemoScreen> createState() => _TelebirrDemoScreenState();
}

class _TelebirrDemoScreenState extends State<TelebirrDemoScreen> {
  late final _api = widget.api ?? TelebirrDemoApi();
  final _amount = TextEditingController(text: '5000');
  String _key = const Uuid().v4();
  String? _requestedAmount, _error;
  Map<String, dynamic>? _payment;
  bool _busy = false, _uncertain = false, _expiryChecked = false;
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    _payment = widget.payment;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _payment != null) {
        setState(() {});
        if (!_busy &&
            !_expiryChecked &&
            _expired &&
            _payment!['status'] == 'PENDING_AUTHORIZATION') {
          _expiryChecked = true;
          _refresh();
        }
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _amount.dispose();
    super.dispose();
  }

  bool get _expired {
    final expiry = DateTime.tryParse('${_payment?['expires_at']}');
    return expiry != null && !expiry.isAfter(DateTime.now());
  }

  Future<void> _create() async {
    if (_busy) return;
    final amount = _amount.text.trim();
    if (!RegExp(r'^\d{1,7}(\.\d{1,2})?$').hasMatch(amount) ||
        !RegExp(r'[1-9]').hasMatch(amount)) {
      setState(() =>
          _error = 'Enter a positive ETB amount with at most two decimals.');
      return;
    }
    // An ambiguous create must be recovered with the same payload/key first.
    if (_requestedAmount == null) {
      _requestedAmount = amount;
      _key = const Uuid().v4();
    }
    await _run(() async {
      try {
        _payment = await _api.create(_requestedAmount!, _key);
      } on DioException catch (e) {
        final status = e.response?.statusCode;
        // Definitive validation rejection can be corrected. Ambiguous network
        // failures retain the original payload and idempotency key.
        if (status != null && status >= 400 && status < 500 && status != 408) {
          _requestedAmount = null;
        }
        rethrow;
      }
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      _error =
          'Network required. No offline approval or credit is possible. ${TransactionsApi.error(e)}';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refresh() => _run(() async {
        _payment = await _api.get(_payment!['payment_id']);
        _uncertain = false;
      });

  Future<void> _act(String action) => _run(() async {
        final id = _payment!['payment_id'] as String;
        // Query durable state before retrying any lost authorization response.
        _payment = await _api.get(id);
        _uncertain = false;
        if (_payment!['status'] != 'PENDING_AUTHORIZATION') return;
        try {
          _payment = await _api.act(id, action, _payment!['amount']);
        } catch (_) {
          _uncertain = true;
          try {
            _payment = await _api.get(id);
            _uncertain = false;
          } catch (_) {
            rethrow;
          }
          if (_payment!['status'] == 'PENDING_AUTHORIZATION') {
            _error =
                'Authorization not confirmed. Review status before retrying.';
          }
        }
      });

  @override
  Widget build(BuildContext context) {
    final p = _payment;
    final status = p?['status'];
    final pending = status == 'PENDING_AUTHORIZATION';
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(title: const Text('Telebirr Payment Simulation')),
        body: Column(children: [
          const Card(
              child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Demo only — No real money will be transferred.',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ))),
          Expanded(
              child: ListView(padding: const EdgeInsets.all(20), children: [
            const Text(
                'Internal marketplace demonstration. Not an official Telebirr payment or provider-endorsed screen. No PIN, OTP or payment credentials are needed.'),
            const SizedBox(height: 20),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            if (p == null) ...[
              TextField(
                  controller: _amount,
                  enabled: !_busy && _requestedAmount == null,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                      labelText: 'Amount (ETB)',
                      helperText: 'Virtual Demo Wallet funds only')),
              FilledButton(
                  onPressed: _busy ? null : _create,
                  child: Text(_requestedAmount == null
                      ? 'Continue'
                      : 'Recover payment request')),
            ] else ...[
              const Text('Merchant: Smart Agricultural Marketplace Demo'),
              Text('Amount: ${p['amount']} ETB',
                  style: Theme.of(context).textTheme.headlineSmall),
              const Text('Type: Simulation · Virtual Demo Wallet'),
              SelectableText('Reference: ${p['reference']}'),
              Text('Status: $status'),
              Text('Authorization expiry: ${p['expires_at']}'),
              if (_expired && pending)
                const Text(
                    'Authorization time elapsed. Refresh to confirm server status.'),
              if (status == 'CREDITED') ...[
                const Text('Demo Payment Successful',
                    style:
                        TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                Text('Virtual wallet ledger: ${p['ledger_reference']}'),
                FilledButton(
                    onPressed:
                        _busy ? null : () => Navigator.pop(context, true),
                    child: const Text('View Wallet')),
              ],
              if (status == 'DECLINED')
                const Text('Demo payment declined. No funds were added.'),
              if (status == 'CANCELLED')
                const Text('Demo payment cancelled. No funds were added.'),
              if (status == 'EXPIRED')
                const Text('Demo authorization expired. No funds were added.'),
              if (status == 'FAILED')
                const Text('Demo payment failed. No confirmed credit.'),
              if (pending) ...[
                FilledButton(
                    onPressed: _busy || _expired || _uncertain
                        ? null
                        : () => _act('approve'),
                    child: const Text('Approve Demo Payment')),
                OutlinedButton(
                    onPressed:
                        _busy || _uncertain ? null : () => _act('decline'),
                    child: const Text('Decline')),
                TextButton(
                    onPressed:
                        _busy || _uncertain ? null : () => _act('cancel'),
                    child: const Text('Cancel demo payment')),
              ],
              OutlinedButton(
                  onPressed: _busy ? null : _refresh,
                  child: const Text('Refresh payment status')),
            ],
          ])),
        ]),
      ),
    );
  }
}
