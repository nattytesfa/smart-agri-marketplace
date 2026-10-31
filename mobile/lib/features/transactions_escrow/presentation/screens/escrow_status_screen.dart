import 'dart:convert';
import 'package:flutter/material.dart';
import '../../../../data/remote/transactions_api.dart';
import '../../../../data/remote/wallet_api.dart';
import 'wallet_screen.dart';
import 'package:uuid/uuid.dart';
import '../widgets/finance_ui.dart';
import '../../../listings/presentation/widgets/marketplace_ui.dart';
import '../../../traceability_qr/presentation/screens/qr_generate_screen.dart';
import '../../../traceability_qr/presentation/screens/qr_scan_screen.dart';

const _hairline = Color(0xFFEDF1EC);
const _softSurface = Color(0xFFF8FAF7);
const _softBorder = Color(0xFFE6ECE4);
const _danger = Color(0xFFAA3E3E);
const _caution = Color(0xFF94651D);

String _balanceLabel(String key) {
  switch (key) {
    case 'paid':
      return 'Paid';
    case 'held':
      return 'Held in escrow';
    case 'settled':
      return 'Settled';
    case 'refunded':
      return 'Refunded';
    case 'disputed':
      return 'Disputed';
    case 'available_for_settlement':
      return 'Ready to settle';
    default:
      return financeLabel(key);
  }
}

IconData _balanceIcon(String key) {
  switch (key) {
    case 'paid':
      return Icons.payments_outlined;
    case 'held':
    case 'hold':
      return Icons.lock_outline_rounded;
    case 'settled':
    case 'settlement':
      return Icons.task_alt_rounded;
    case 'refunded':
    case 'refund':
      return Icons.undo_rounded;
    case 'disputed':
      return Icons.gavel_rounded;
    case 'available_for_settlement':
      return Icons.hourglass_bottom_rounded;
    default:
      return Icons.account_balance_wallet_outlined;
  }
}

bool _isZero(Object? value) => double.tryParse(value?.toString() ?? '0') == 0;

IconData _activityIcon(String action) {
  if (action.contains('dispute')) return Icons.gavel_rounded;
  if (action.contains('payment_failed')) return Icons.error_outline_rounded;
  if (action.contains('cancel')) return Icons.block_rounded;
  if (action.contains('refund')) return Icons.undo_rounded;
  if (action.contains('settle')) return Icons.task_alt_rounded;
  if (action.contains('payment')) return Icons.payments_outlined;
  if (action.contains('ready')) return Icons.local_shipping_outlined;
  if (action.contains('qr')) return Icons.qr_code_2_rounded;
  if (action.contains('confirmed')) return Icons.verified_outlined;
  return Icons.receipt_long_outlined;
}

Color _activityTone(String action) {
  if (action.contains('failed') ||
      action.contains('dispute_opened') ||
      action.contains('cancel')) {
    return _danger;
  }
  if (action.contains('dispute') || action.contains('refund')) {
    return _caution;
  }
  if (action.contains('payment') ||
      action.contains('settle') ||
      action.contains('confirmed')) {
    return marketGreen;
  }
  return const Color(0xFF586978);
}

const _metaLabels = {
  'amount': 'Amount',
  'method': 'Method',
  'decision': 'Decision',
  'verification_id': 'Verification',
  'dispute_id': 'Dispute',
  'allocation': 'Allocation',
  'pricing_policy': 'Pricing policy',
};

const _technicalMeta = ['simulated', 'no_real_funds'];

String _metaValue(String key, Object? value) {
  final text = value?.toString() ?? '';
  if (key == 'amount') return 'ETB ${walletMoney(text)}';
  if (key == 'method' || key == 'decision') return financeLabel(text);
  if (RegExp(r'^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')
      .hasMatch(text)) {
    return text.substring(0, 8);
  }
  return financeLabel(text);
}

class EscrowStatusScreen extends StatefulWidget {
  const EscrowStatusScreen(
      {super.key, required this.transactionId, this.api, this.walletApi});
  final String transactionId;
  final TransactionsApi? api;
  final WalletApi? walletApi;
  @override
  State<EscrowStatusScreen> createState() => _EscrowStatusScreenState();
}

class _EscrowStatusScreenState extends State<EscrowStatusScreen> {
  late final _api = widget.api ?? TransactionsApi();
  Map<String, dynamic>? _order;
  bool _busy = false;
  String? _error;
  String _method = 'telebirr';
  final _walletKey = const Uuid().v4();
  Map<String, dynamic>? _walletQuote;
  Future<void> _loadQuote() async {
    try {
      final q =
          await (widget.walletApi ?? WalletApi()).quote(widget.transactionId);
      if (mounted) setState(() => _walletQuote = q);
    } catch (e) {
      if (mounted) setState(() => _error = TransactionsApi.error(e));
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await _api.get(widget.transactionId);
      if (mounted) {
        final initial = _order == null;
        setState(() {
          if (initial &&
              ['telebirr', 'cbe_birr', 'demo_wallet']
                  .contains(data['payment_method'])) {
            _method = data['payment_method'];
          }
          _order = data;
          _error = null;
        });
        if (initial &&
            _method == 'demo_wallet' &&
            data['checkout_status'] == 'pending') {
          await _loadQuote();
        }
      }
    } catch (e) {
      if (mounted) setState(() => _error = TransactionsApi.error(e));
    }
  }

  Future<bool> _confirm(String text) async =>
      await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
                title: const Text('Confirm demo action'),
                content: Text(text),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Back')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Confirm')),
                ],
              )) ??
      false;
  Future<void> _act(String path, [Map<String, dynamic>? data]) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _api.action(widget.transactionId, path, data);
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = TransactionsApi.error(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _dispute(Map<String, dynamic> a) async {
    String description = '', evidence = '';
    String reason = 'not_delivered';
    bool invalid = false;
    final submitted = await showDialog<bool>(
        context: context,
        builder: (context) => StatefulBuilder(
            builder: (context, update) => AlertDialog(
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(22)),
                  titlePadding: const EdgeInsets.fromLTRB(24, 22, 24, 0),
                  contentPadding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                  actionsPadding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  title: const Row(children: [
                    Icon(Icons.gavel_rounded, color: _caution, size: 22),
                    SizedBox(width: 10),
                    Expanded(
                        child: Text('Raise a dispute',
                            style: TextStyle(
                                color: marketInk,
                                fontSize: 18,
                                fontWeight: FontWeight.w800))),
                  ]),
                  content: SingleChildScrollView(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                        const Text(
                            'Describe what went wrong with this allocation. An admin will review the held demo funds.',
                            style: TextStyle(
                                color: marketMuted, fontSize: 12, height: 1.5)),
                        const SizedBox(height: 16),
                        DropdownButtonFormField<String>(
                            initialValue: reason,
                            isExpanded: true,
                            decoration: const InputDecoration(
                                labelText: 'Reason',
                                prefixIcon:
                                    Icon(Icons.report_problem_outlined)),
                            items: [
                              for (final r in [
                                'not_delivered',
                                'incorrect_quantity',
                                'poor_quality',
                                'wrong_product',
                                'other'
                              ])
                                DropdownMenuItem(
                                    value: r, child: Text(financeLabel(r)))
                            ],
                            onChanged: (v) => update(() => reason = v!)),
                        const SizedBox(height: 14),
                        TextField(
                            onChanged: (v) => update(() {
                                  description = v;
                                  invalid = false;
                                }),
                            maxLength: 4000,
                            minLines: 3,
                            maxLines: 6,
                            decoration: InputDecoration(
                                labelText: 'Describe the issue',
                                alignLabelWithHint: true,
                                helperText: 'At least 10 characters',
                                errorText: invalid
                                    ? 'Please add a little more detail'
                                    : null)),
                        const SizedBox(height: 6),
                        TextField(
                            onChanged: (v) => evidence = v,
                            decoration: const InputDecoration(
                                labelText: 'Evidence link (optional)',
                                helperText: 'Must be an HTTPS link',
                                prefixIcon: Icon(Icons.link_rounded))),
                      ])),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Back')),
                    FilledButton.icon(
                        onPressed: () {
                          if (description.trim().length >= 10) {
                            Navigator.pop(context, true);
                          } else {
                            update(() => invalid = true);
                          }
                        },
                        icon: const Icon(Icons.send_rounded, size: 18),
                        label: const Text('Submit dispute')),
                  ],
                )));
    if (submitted == true && mounted) {
      await _act('allocations/${a['allocation_id']}/disputes', {
        'reason': reason,
        'description': description.trim(),
        'evidence': evidence.trim().isEmpty ? [] : [evidence.trim()],
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _order;
    final buyer = o != null &&
        (o['is_buyer'] == true ||
            (o['is_buyer'] == null && o['buyer_id'] == _api.currentUserId));
    return MarketplaceTheme(
        child: Scaffold(
      appBar: AppBar(title: const Text('Order & Escrow'), actions: [
        IconButton(
            tooltip: 'Refresh order',
            onPressed: _busy ? null : _load,
            icon: const Icon(Icons.refresh))
      ]),
      body: o == null
          ? Center(
              child: _error != null
                  ? MarketEmpty(
                      icon: Icons.cloud_off_outlined,
                      title: 'Unable to load your order',
                      message: _error!,
                      action: FilledButton.icon(
                          onPressed: _load,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Try again')))
                  : const CircularProgressIndicator())
          : Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 840),
                  child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                      children: [
                        const MarketNotice(
                            message:
                                'SIMULATED PAYMENT MODE\nNo provider is contacted. No real funds move.'),
                        const SizedBox(height: 16),
                        _orderSummary(o),
                        const SizedBox(height: 20),
                        if (o['reconciliation_reason'] != null)
                          Padding(
                              padding: const EdgeInsets.only(bottom: 16),
                              child: MarketNotice(
                                  message: o['reconciliation_reason'],
                                  warning: true)),
                        if (o['payment_status'] == 'pending') ...[
                          const FinancePanel(
                              child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Icon(Icons.schedule_rounded, color: _caution),
                                SizedBox(width: 12),
                                Expanded(
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                      Text('Awaiting Simulated Payment',
                                          style: TextStyle(
                                              color: marketInk,
                                              fontWeight: FontWeight.w700)),
                                      SizedBox(height: 6),
                                      Text(
                                          'No demo funds are held. Reviewing checkout does not pay or fund escrow.',
                                          style: TextStyle(
                                              color: marketMuted,
                                              fontSize: 12,
                                              height: 1.6))
                                    ]))
                              ])),
                          const SizedBox(height: 16),
                        ] else ...[
                          _escrowPanel(o),
                          const SizedBox(height: 16),
                        ],
                        if (buyer && o['checkout_status'] == 'pending') ...[
                          FinancePanel(
                              child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                const FinancePanelHeader(
                                    icon: Icons.credit_card_outlined,
                                    title: 'Fund your checkout',
                                    subtitle:
                                        'Choose a simulated payment method. Confirm only when you are ready.'),
                                const SizedBox(height: 18),
                                DropdownButton<String>(
                                    value: _method,
                                    isExpanded: true,
                                    items: const [
                                      DropdownMenuItem(
                                          value: 'telebirr',
                                          child: Text('Simulated Telebirr')),
                                      DropdownMenuItem(
                                          value: 'cbe_birr',
                                          child: Text('Simulated CBE Birr')),
                                      DropdownMenuItem(
                                          value: 'demo_wallet',
                                          child: Text('Pay With Demo Wallet')),
                                    ],
                                    onChanged: _busy
                                        ? null
                                        : (v) {
                                            setState(() {
                                              _method = v!;
                                              _walletQuote = null;
                                            });
                                            if (v == 'demo_wallet') {
                                              _loadQuote();
                                            }
                                          }),
                                if (_method == 'demo_wallet') ...[
                                  const SizedBox(height: 16),
                                  if (_walletQuote != null)
                                    Container(
                                        padding: const EdgeInsets.all(16),
                                        decoration: BoxDecoration(
                                            color: _softSurface,
                                            borderRadius:
                                                BorderRadius.circular(14),
                                            border:
                                                Border.all(color: _softBorder)),
                                        child: Text(
                                            'Available ETB ${_walletQuote!['available']}\nCheckout ETB ${_walletQuote!['total']}\nRemaining after payment ETB ${_walletQuote!['remaining']}\nAdditional funds required ETB ${_walletQuote!['additional_required']}',
                                            style: const TextStyle(
                                                color: marketInk,
                                                fontSize: 13,
                                                height: 1.9))),
                                  if (_walletQuote == null && _error == null)
                                    const LinearProgressIndicator(minHeight: 2),
                                  if (_walletQuote != null &&
                                      _walletQuote!['additional_required'] !=
                                          '0.00')
                                    const Padding(
                                        padding: EdgeInsets.only(top: 10),
                                        child: MarketNotice(
                                            message:
                                                'Insufficient demo funds. Top up your wallet to continue; your checkout has not been paid.',
                                            warning: true)),
                                  TextButton.icon(
                                      onPressed: () async {
                                        await Navigator.push(
                                            context,
                                            MaterialPageRoute(
                                                builder: (_) =>
                                                    const WalletScreen()));
                                        await _loadQuote();
                                      },
                                      icon: const Icon(
                                          Icons.account_balance_wallet_outlined,
                                          size: 18),
                                      label: const Text(
                                          'Open Demo Wallet / Top Up')),
                                ],
                                const SizedBox(height: 16),
                                FilledButton.icon(
                                    onPressed: _busy ||
                                            (_method == 'demo_wallet' &&
                                                (_walletQuote == null ||
                                                    _walletQuote![
                                                            'additional_required'] !=
                                                        '0.00'))
                                        ? null
                                        : () async {
                                            if (await _confirm(
                                                'Record ETB ${o['amount']} as a simulated payment? No real money will be collected.')) {
                                              await _act('simulate-payment', {
                                                'method': _method,
                                                if (_method == 'demo_wallet')
                                                  'idempotency_key': _walletKey,
                                                if (_method == 'demo_wallet')
                                                  'confirm_demo': true
                                              });
                                              if (_method == 'demo_wallet') {
                                                await _loadQuote();
                                              }
                                            }
                                          },
                                    icon: const Icon(
                                        Icons.play_circle_outline_rounded,
                                        size: 18),
                                    label: const Text('Confirm demo payment')),
                              ])),
                        ],
                        if (buyer &&
                            ['pending', 'fulfilling']
                                .contains(o['checkout_status']))
                          TextButton(
                              onPressed: _busy
                                  ? null
                                  : () async {
                                      if (await _confirm(
                                          'Cancel this order? Eligible reservations will be released and held demo funds refunded in simulation only.')) {
                                        await _act('cancel');
                                      }
                                    },
                              child: const Text('Cancel eligible checkout')),
                        if (_busy) const LinearProgressIndicator(),
                        if (_error != null)
                          Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: MarketNotice(
                                  message: _error!, warning: true)),
                        const SizedBox(height: 20),
                        _sectionHeader('Produce & farmer allocations',
                            'Track each contribution and its delivery, then settle or raise a dispute.',
                            trailing: FinanceBadge(
                                label:
                                    '${(o['allocations'] as List).length} items',
                                icon: Icons.inventory_2_outlined)),
                        if ((o['allocations'] as List).isEmpty)
                          const FinancePanel(
                              child: Text('No allocations recorded yet.',
                                  style: TextStyle(color: marketMuted)))
                        else
                          for (final raw in o['allocations'] as List)
                            _allocation(Map<String, dynamic>.from(raw), buyer,
                                o['payment_status'] == 'simulated_paid'),
                        const SizedBox(height: 24),
                        _sectionHeader('Transaction history',
                            'A recorded timeline of every action on this order.',
                            trailing: FinanceBadge(
                                label:
                                    '${(o['history'] as List).length} events',
                                icon: Icons.history_rounded)),
                        if ((o['history'] as List).isEmpty)
                          const FinancePanel(
                              child: Text('No activity recorded yet.',
                                  style: TextStyle(color: marketMuted)))
                        else
                          _historyPanel(o['history'] as List),
                      ]))),
    ));
  }

  Widget _sectionHeader(String title, String subtitle, {Widget? trailing}) =>
      Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(title,
                      style: const TextStyle(
                          color: marketInk,
                          fontSize: 19,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 5),
                  Text(subtitle,
                      style: const TextStyle(
                          color: marketMuted, fontSize: 12, height: 1.5)),
                ])),
            if (trailing != null) ...[
              const SizedBox(width: 12),
              Padding(padding: const EdgeInsets.only(top: 2), child: trailing)
            ],
          ]));

  Widget _orderSummary(Map<String, dynamic> o) {
    final escrow = o['payment_status'] == 'pending'
        ? 'unfunded'
        : o['escrow_status'] ?? 'unfunded';
    final funded = o['payment_status'] != 'pending';
    return FinancePanel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const FinancePanelHeader(
          icon: Icons.receipt_long_outlined,
          title: 'Order summary',
          subtitle: 'Simulated checkout · figures are for this demo only',
          trailing: FinanceBadge(label: 'DEMO', icon: Icons.science_outlined)),
      const Padding(
          padding: EdgeInsets.symmetric(vertical: 18),
          child: Divider(height: 1, color: _hairline)),
      const Text('Total payable',
          style: TextStyle(
              color: marketMuted,
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 1)),
      const SizedBox(height: 6),
      FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
              'ETB ${walletMoney(o['amount'] ?? o['balances']['paid'])}',
              style: const TextStyle(
                  color: marketInk,
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.5))),
      const SizedBox(height: 14),
      Wrap(spacing: 8, runSpacing: 8, children: [
        FinanceStatus(o['payment_status'].toString(),
            warning: o['payment_status'] == 'pending'),
        FinanceStatus(o['checkout_status'].toString(),
            warning: ['expired', 'cancelled', 'reconciliation_required']
                .contains(o['checkout_status']))
      ]),
      const SizedBox(height: 18),
      _summaryDetail(
          'Order reference',
          SelectableText(widget.transactionId,
              style: const TextStyle(
                  color: marketInk, fontSize: 11.5, fontFamily: 'monospace'))),
      const SizedBox(height: 12),
      _summaryDetail(
          'Checkout deadline',
          Text(financeDate(context, o['checkout_expires_at']),
              style: const TextStyle(
                  color: marketInk,
                  fontSize: 12,
                  fontWeight: FontWeight.w600))),
      const SizedBox(height: 12),
      _summaryDetail(
          'Simulated escrow status',
          Row(children: [
            Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                    color: funded ? marketGreen : _caution,
                    shape: BoxShape.circle)),
            const SizedBox(width: 7),
            Text(financeLabel(escrow),
                style: TextStyle(
                    color: funded ? marketGreen : _caution,
                    fontSize: 12,
                    fontWeight: FontWeight.w700))
          ])),
    ]));
  }

  Widget _summaryDetail(String label, Widget child) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label.toUpperCase(),
            style: const TextStyle(
                color: marketMuted,
                fontSize: 9.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.1)),
        const SizedBox(height: 5),
        child,
      ]);

  Widget _escrowPanel(Map<String, dynamic> o) {
    final balances = Map<String, dynamic>.from(o['balances'] as Map);
    return FinancePanel(
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const FinancePanelHeader(
          icon: Icons.account_balance_wallet_outlined,
          title: 'Simulated escrow',
          subtitle:
              'Demo funds only. No provider is contacted and no real money is held or moved.',
          trailing: FinanceBadge(label: 'DEMO FUNDS')),
      const Padding(
          padding: EdgeInsets.symmetric(vertical: 18),
          child: Divider(height: 1, color: _hairline)),
      LayoutBuilder(builder: (context, constraints) {
        final tileWidth = ((constraints.maxWidth - 10) / 2).clamp(96.0, 260.0);
        return Wrap(spacing: 10, runSpacing: 10, children: [
          for (final entry in balances.entries)
            SizedBox(
                width: tileWidth,
                child: FinanceBalanceTile(
                    label: _balanceLabel(entry.key),
                    amount: entry.value,
                    icon: _balanceIcon(entry.key)))
        ]);
      }),
      const SizedBox(height: 14),
      const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.shield_outlined, size: 15, color: marketMuted),
        SizedBox(width: 7),
        Expanded(
            child: Text(
                'Virtual ETB ledger · every balance on this page is simulated.',
                style:
                    TextStyle(color: marketMuted, fontSize: 11, height: 1.45))),
      ]),
    ]));
  }

  Widget _historyPanel(List events) => FinancePanel(
      padding: 0,
      child: Column(children: [
        const Padding(
            padding: EdgeInsets.fromLTRB(18, 16, 18, 16),
            child: FinancePanelHeader(
                icon: Icons.history_rounded,
                title: 'Activity timeline',
                subtitle: 'Newest actions appear as the order progresses.')),
        const Divider(height: 1, color: _hairline),
        for (var i = 0; i < events.length; i++)
          _HistoryEventTile(
              event: Map<String, dynamic>.from(events[i]),
              isLast: i == events.length - 1),
      ]));

  Widget _allocation(Map<String, dynamic> a, bool buyer, bool paid) {
    final id = a['allocation_id'];
    final trace = Map<String, dynamic>.from(a['traceability'] as Map);
    final blocked = ['open', 'under_review'].contains(a['dispute_status']);
    final held = a['settlement_status'] == 'held';
    final balances = Map<String, dynamic>.from(a['balances'] as Map);
    final disputes = (a['disputes'] as List?) ?? const [];
    final ledger = (a['ledger'] as List?) ?? const [];
    final funded = a['settlement_status'] != 'unfunded';
    final refunded = (a['refund_status'] ?? 'none') != 'none';
    return Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
                color: blocked ? const Color(0xFFF0DCC3) : _softBorder),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x0820352B),
                  blurRadius: 18,
                  offset: Offset(0, 8))
            ]),
        child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
                      child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(
                                    color: const Color(0xFFEDF3EC),
                                    borderRadius: BorderRadius.circular(14)),
                                child: const Icon(Icons.eco_outlined,
                                    color: marketGreen, size: 22)),
                            const SizedBox(width: 12),
                            Expanded(
                                flex: 3,
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text('${trace['crop_type'] ?? 'Produce'}',
                                          style: const TextStyle(
                                              color: marketInk,
                                              fontSize: 16,
                                              fontWeight: FontWeight.w800)),
                                      const SizedBox(height: 3),
                                      Text(
                                          '${trace['variety'] ?? '—'} · ${a['farmer_name'] ?? 'Farmer'}',
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                              color: marketMuted,
                                              fontSize: 11.5,
                                              height: 1.35)),
                                    ])),
                            const SizedBox(width: 10),
                            Flexible(
                                flex: 2,
                                child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      const Text('TOTAL',
                                          style: TextStyle(
                                              color: marketMuted,
                                              fontSize: 9,
                                              fontWeight: FontWeight.w700,
                                              letterSpacing: 1)),
                                      const SizedBox(height: 2),
                                      FittedBox(
                                          fit: BoxFit.scaleDown,
                                          alignment: Alignment.centerRight,
                                          child: Text(
                                              'ETB ${walletMoney(a['amount'])}',
                                              style: const TextStyle(
                                                  color: marketInk,
                                                  fontSize: 17,
                                                  fontWeight:
                                                      FontWeight.w800))),
                                    ])),
                          ])),
                  const Divider(height: 1, color: _hairline),
                  Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(children: [
                              Expanded(
                                  child: FinanceInfoTile(
                                      label: 'Quantity',
                                      value: '${a['quantity']} ${a['unit']}',
                                      icon: Icons.scale_outlined)),
                              const SizedBox(width: 10),
                              Expanded(
                                  child: FinanceInfoTile(
                                      label: 'Unit price',
                                      value:
                                          'ETB ${walletMoney(a['unit_price'])}',
                                      icon: Icons.sell_outlined)),
                            ]),
                            const SizedBox(height: 14),
                            Wrap(spacing: 8, runSpacing: 8, children: [
                              FinanceStatus(a['delivery_status'].toString()),
                              FinanceStatus(a['settlement_status'].toString(),
                                  warning: blocked),
                              if (refunded)
                                FinanceBadge(
                                    label: 'Refunded · ${a['refund_status']}',
                                    icon: Icons.undo_rounded,
                                    color: _caution),
                              if (blocked)
                                const FinanceStatus('Disputed', warning: true),
                            ]),
                            if (!funded) ...[
                              const SizedBox(height: 12),
                              const MarketNotice(
                                  message:
                                      'Awaiting simulated payment — this allocation is not funded yet.',
                                  warning: true),
                            ] else ...[
                              const SizedBox(height: 16),
                              const Text('ESCROW BALANCE · DEMO FUNDS',
                                  style: TextStyle(
                                      color: marketMuted,
                                      fontSize: 9.5,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 1)),
                              const SizedBox(height: 4),
                              for (final entry in balances.entries)
                                if (!_isZero(entry.value))
                                  FinanceLineRow(
                                      label: _balanceLabel(entry.key),
                                      caption: 'Simulated funds',
                                      icon: _balanceIcon(entry.key),
                                      value: 'ETB ${walletMoney(entry.value)}',
                                      valueColor: entry.key == 'held' ||
                                              entry.key == 'disputed'
                                          ? (blocked ? _caution : marketGreen)
                                          : marketInk,
                                      bold: entry.key == 'held'),
                            ],
                            ..._allocationActions(
                                a, buyer, paid, blocked, held, id),
                            const SizedBox(height: 14),
                            _traceability(a, trace),
                            for (final d in disputes) _disputeCard(d),
                            if (ledger.isNotEmpty) _ledgerPanel(ledger),
                          ])),
                ])));
  }

  List<Widget> _allocationActions(Map<String, dynamic> a, bool buyer, bool paid,
      bool blocked, bool held, dynamic id) {
    final actions = <Widget>[];
    void add(Widget child) {
      if (actions.isNotEmpty) actions.add(const SizedBox(height: 8));
      actions.add(child);
    }

    if (paid &&
        held &&
        !blocked &&
        !buyer &&
        a['delivery_status'] == 'awaiting_fulfillment') {
      add(FilledButton.icon(
          onPressed: _busy ? null : () => _act('allocations/$id/ready'),
          icon: const Icon(Icons.local_shipping_outlined, size: 18),
          label: const Text('Mark ready for delivery')));
    }
    if (paid && held && !blocked && a['delivery_status'] == 'ready') {
      add(OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () async {
                  await Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => buyer
                              ? QrScanScreen(
                                  transactionId: widget.transactionId,
                                  allocationId: id)
                              : QrGenerateScreen(
                                  transactionId: widget.transactionId,
                                  allocationId: id)));
                  if (mounted) await _load();
                },
          icon: Icon(
              buyer ? Icons.qr_code_scanner_rounded : Icons.qr_code_2_rounded,
              size: 18),
          label: Text(buyer ? 'Verify delivery QR' : 'Show delivery QR')));
    }
    if (paid && held && !blocked && a['delivery_status'] == 'delivered') {
      add(FilledButton.tonalIcon(
          onPressed: _busy
              ? null
              : () async {
                  if (await _confirm(
                      'Settle the remaining allocation in simulation? This prevents further ordinary disputes or refunds. No actual payout occurs.')) {
                    await _act('allocations/$id/settle');
                  }
                },
          icon: const Icon(Icons.task_alt_rounded, size: 18),
          label: const Text('Settle in simulation')));
    }
    if (buyer && paid && held && !blocked) {
      add(OutlinedButton.icon(
          onPressed: _busy ? null : () => _dispute(a),
          style: OutlinedButton.styleFrom(
              foregroundColor: _danger,
              minimumSize: const Size(48, 50),
              side: const BorderSide(color: Color(0xFFEBD3D3)),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14))),
          icon: const Icon(Icons.gavel_rounded, size: 18),
          label: const Text('Raise a dispute')));
    }
    if (actions.isEmpty) return actions;
    return [const SizedBox(height: 16), ...actions];
  }

  Widget _traceability(Map<String, dynamic> a, Map<String, dynamic> trace) =>
      Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Material(
              color: _softSurface,
              clipBehavior: Clip.antiAlias,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: const BorderSide(color: _softBorder)),
              child: Theme(
                  data: Theme.of(context)
                      .copyWith(dividerColor: Colors.transparent),
                  child: ExpansionTile(
                      tilePadding: const EdgeInsets.symmetric(horizontal: 14),
                      childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                      leading: const Icon(Icons.public_rounded,
                          size: 20, color: marketGreen),
                      iconColor: marketGreen,
                      collapsedIconColor: marketMuted,
                      title: const Text('Traceability & origin',
                          style: TextStyle(
                              color: marketInk,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700)),
                      children: [
                        _traceRow('Listing', a['listing_id']?.toString(),
                            mono: true),
                        _traceRow('Origin', trace['origin']?.toString()),
                        _traceRow(
                            'Harvest date', trace['harvest_date']?.toString()),
                        _traceRow('Quality grade',
                            '${trace['quality_grade'] ?? 'Not provided'} (farmer-reported)'),
                      ]))));

  Widget _traceRow(String label, String? value, {bool mono = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
            width: 92,
            child: Text(label,
                style: const TextStyle(
                    color: marketMuted, fontSize: 11, height: 1.45))),
        const SizedBox(width: 8),
        Expanded(
            child: Text((value ?? '').trim().isEmpty ? 'Not provided' : value!,
                style: TextStyle(
                    color: marketInk,
                    fontSize: 11.5,
                    height: 1.45,
                    fontFamily: mono ? 'monospace' : null))),
      ]));

  Widget _disputeCard(Map<String, dynamic> d) {
    final note = d['resolution_note']?.toString();
    return Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: const Color(0xFFFFFAF2),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFF2E4CC))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.report_problem_outlined,
                size: 16, color: _caution),
            const SizedBox(width: 8),
            Expanded(
                child: Text(financeLabel(d['reason']),
                    style: const TextStyle(
                        color: marketInk,
                        fontSize: 12,
                        fontWeight: FontWeight.w700))),
            const SizedBox(width: 8),
            FinanceStatus(d['status'].toString(), warning: true),
          ]),
          const SizedBox(height: 8),
          Text(d['description']?.toString() ?? '',
              style:
                  const TextStyle(color: marketInk, fontSize: 12, height: 1.5)),
          if (note != null && note.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Resolution: $note',
                style: const TextStyle(
                    color: marketMuted, fontSize: 11.5, height: 1.5)),
          ],
          const SizedBox(height: 8),
          Text(financeDate(context, d['created_at']),
              style: const TextStyle(color: marketMuted, fontSize: 10)),
        ]));
  }

  Widget _ledgerPanel(List ledger) => Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Material(
          color: _softSurface,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: const BorderSide(color: _softBorder)),
          child: Theme(
              data:
                  Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                  tilePadding: const EdgeInsets.symmetric(horizontal: 14),
                  childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                  leading: const Icon(Icons.receipt_outlined,
                      size: 20, color: marketGreen),
                  iconColor: marketGreen,
                  collapsedIconColor: marketMuted,
                  title: const Text('Simulated ledger',
                      style: TextStyle(
                          color: marketInk,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700)),
                  subtitle: Text('${ledger.length} entries · demo funds',
                      style:
                          const TextStyle(color: marketMuted, fontSize: 10.5)),
                  children: [
                    for (final e in ledger)
                      FinanceLineRow(
                          label: financeLabel(e['event_type']),
                          caption: financeDate(context, e['created_at']),
                          icon: _balanceIcon(e['event_type'].toString()),
                          value: 'ETB ${walletMoney(e['amount'])}')
                  ]))));
}

class _HistoryEventTile extends StatefulWidget {
  const _HistoryEventTile({required this.event, required this.isLast});
  final Map<String, dynamic> event;
  final bool isLast;
  @override
  State<_HistoryEventTile> createState() => _HistoryEventTileState();
}

class _HistoryEventTileState extends State<_HistoryEventTile> {
  bool _open = false;
  @override
  Widget build(BuildContext context) {
    final event = widget.event;
    final action = event['action']?.toString() ?? '';
    final meta =
        Map<String, dynamic>.from((event['metadata'] as Map?) ?? const {});
    final allocation = event['allocation_id']?.toString();
    final details = <MapEntry<String, Object?>>[
      if (allocation != null && allocation.isNotEmpty)
        MapEntry('allocation', allocation),
      ...meta.entries.where((e) => !_technicalMeta.contains(e.key)),
    ];
    final note = meta['note']?.toString();
    final tone = _activityTone(action);
    return Column(children: [
      Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                    color: tone.withValues(alpha: .09),
                    borderRadius: BorderRadius.circular(12)),
                child: Icon(_activityIcon(action), size: 18, color: tone)),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(financeLabel(action),
                      style: const TextStyle(
                          color: marketInk,
                          fontSize: 13,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 3),
                  Text(financeDate(context, event['created_at']),
                      style: const TextStyle(
                          color: marketMuted, fontSize: 11, height: 1.4)),
                  if (details.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      for (final entry in details)
                        FinanceMetaChip(
                            label:
                                '${_metaLabels[entry.key] ?? financeLabel(entry.key)} · ',
                            value: _metaValue(entry.key, entry.value))
                    ]),
                  ],
                  if (note != null && note.trim().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(note,
                        style: const TextStyle(
                            color: marketInk, fontSize: 11.5, height: 1.5)),
                  ],
                  if (meta.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () => setState(() => _open = !_open),
                        child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child:
                                Row(mainAxisSize: MainAxisSize.min, children: [
                              Flexible(
                                  child: Text(
                                      _open
                                          ? 'Hide event data'
                                          : 'View event data',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          color: marketMuted,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600))),
                              const SizedBox(width: 2),
                              Icon(
                                  _open
                                      ? Icons.expand_less_rounded
                                      : Icons.expand_more_rounded,
                                  size: 16,
                                  color: marketMuted)
                            ]))),
                    if (_open) ...[
                      const SizedBox(height: 8),
                      Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                              color: _softSurface,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: _softBorder)),
                          child: SelectableText(
                              const JsonEncoder.withIndent('  ').convert(meta),
                              style: const TextStyle(
                                  color: marketMuted,
                                  fontFamily: 'monospace',
                                  fontSize: 11,
                                  height: 1.6))),
                    ],
                  ],
                ])),
          ])),
      if (!widget.isLast)
        const Divider(height: 1, indent: 62, endIndent: 16, color: _hairline),
    ]);
  }
}
