import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../../../../data/remote/wallet_api.dart';
import '../../../../data/remote/transactions_api.dart';
import 'transaction_history_screen.dart';
import 'escrow_status_screen.dart';
import 'telebirr_funding_screen.dart';
import 'telebirr_demo_screen.dart';
import '../../../../data/remote/telebirr_demo_api.dart';
import '../../../listings/presentation/widgets/marketplace_ui.dart';
import '../widgets/finance_ui.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key, this.api, this.demoApi});
  final WalletApi? api;
  final TelebirrDemoApi? demoApi;
  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  late final _api = widget.api ?? WalletApi();
  late final _demoApi = widget.demoApi ?? TelebirrDemoApi();
  Map<String, dynamic>? _summary;
  final List<Map<String, dynamic>> _history = [];
  List<Map<String, dynamic>> _demoPayments = [];
  bool _busy = false, _more = false;
  String? _error, _retryAmount, _retryKey;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool next = false}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final summary = await _api.summary();
      final history = await _api.history(next ? _history.length : 0);
      final demos = summary['telebirr_simulation_enabled'] == true
          ? await _demoApi.history()
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _demoPayments = demos;
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

  Future<void> _topUp() async {
    final controller = TextEditingController(text: _retryAmount ?? '10000');
    final amount = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('Add Demo Funds'),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24)),
              icon: const Icon(Icons.account_balance_wallet_outlined,
                  color: marketGreen, size: 32),
              content: SingleChildScrollView(
                  child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    const Text(
                        'Virtual ETB only. No real money will be transferred.'),
                    const SizedBox(height: 16),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final n in ['1000', '5000', '10000', '50000'])
                        ActionChip(
                            onPressed: () => controller.text = n,
                            label: Text('${walletMoney(n)} ETB'))
                    ]),
                    const SizedBox(height: 18),
                    TextField(
                        controller: controller,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(
                            labelText: 'Custom amount (ETB)',
                            prefixText: 'ETB ',
                            helperText:
                                'Virtual funds for demo purchases only')),
                  ])),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel')),
                FilledButton(
                    onPressed: () =>
                        Navigator.pop(context, controller.text.trim()),
                    child: const Text('Review'))
              ],
            ));
    controller.dispose();
    if (amount == null || !mounted) return;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('Confirm virtual top-up'),
              content: Text(
                  'Add $amount ETB in demo funds? No real money will be transferred.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Cancel')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Add demo funds'))
              ],
            ));
    if (confirmed != true || !mounted) return;
    // Preserve a failed request's key for safe retry after an ambiguous response.
    if (_retryAmount != amount) {
      _retryKey = const Uuid().v4();
      _retryAmount = amount;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _api.topUp(amount, _retryKey!);
      _retryAmount = null;
      _retryKey = null;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Demo available balance: ETB ${result['available']}')));
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = TransactionsApi.error(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addFunds() async {
    final method = await showModalBottomSheet<String>(
        context: context,
        builder: (context) => SafeArea(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
              const ListTile(
                  title: Text('Add Funds'),
                  subtitle:
                      Text('Demo only — No real money will be transferred.')),
              ListTile(
                  title: const Text('Instant Demo Top-up'),
                  onTap: () => Navigator.pop(context, 'instant')),
              if (_summary?['telebirr_simulation_enabled'] == true)
                ListTile(
                    title: const Text('Telebirr Demo Payment'),
                    subtitle: const Text('Internal simulated authorization'),
                    onTap: () => Navigator.pop(context, 'simulation')),
              ListTile(
                  title: const Text('Telebirr UAT'),
                  subtitle: const Text(
                      'Unavailable until official safety gates are satisfied'),
                  enabled: _summary?['telebirr_uat_enabled'] == true,
                  onTap: _summary?['telebirr_uat_enabled'] == true
                      ? () => Navigator.pop(context, 'uat')
                      : null),
            ])));
    if (!mounted) return;
    if (method == 'instant') {
      await _topUp();
      return;
    }
    if (method == null) return;
    await Navigator.push(
        context,
        MaterialPageRoute(
            builder: (_) => method == 'simulation'
                ? TelebirrDemoScreen(api: _demoApi)
                : const TelebirrFundingScreen()));
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = _summary;
    final buyer = s?['wallet_type'] == 'buyer';
    return MarketplaceTheme(
        child: Scaffold(
      appBar: AppBar(title: const Text('Wallet & Escrow'), actions: [
        IconButton(
            tooltip: 'Refresh wallet',
            onPressed: _busy ? null : _load,
            icon: const Icon(Icons.refresh))
      ]),
      body: RefreshIndicator(onRefresh: () async {
        if (!_busy) await _load();
      }, child: LayoutBuilder(builder: (context, constraints) {
        final padding = constraints.maxWidth > 600 ? 28.0 : 16.0;
        return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(padding, 8, padding, 32),
            children: [
              Center(
                  child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 960),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            MarketIntro(
                                eyebrow: s == null
                                    ? 'Your demo wallet'
                                    : buyer
                                        ? 'Your marketplace wallet'
                                        : 'Your earnings overview',
                                title: 'Every birr, accounted for.',
                                subtitle:
                                    'A clear view of your virtual funds, protected escrow and recent activity.'),
                            const SizedBox(height: 20),
                            const DemoFundsNotice(),
                            const SizedBox(height: 20),
                            if (_busy)
                              const Padding(
                                  padding: EdgeInsets.only(bottom: 16),
                                  child: LinearProgressIndicator(minHeight: 3)),
                            if (_error != null)
                              Padding(
                                  padding: const EdgeInsets.only(bottom: 16),
                                  child: FinancePanel(
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                        MarketNotice(
                                            message: _error!, warning: true),
                                        TextButton.icon(
                                            onPressed: _busy ? null : _load,
                                            icon: const Icon(Icons.refresh),
                                            label: const Text('Try again'))
                                      ]))),
                            if (s == null && _busy)
                              const Padding(
                                  padding: EdgeInsets.only(bottom: 20),
                                  child: FinancePanel(
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                        Icon(
                                            Icons
                                                .account_balance_wallet_outlined,
                                            color: marketMuted,
                                            size: 30),
                                        SizedBox(height: 20),
                                        Text('Loading your wallet…',
                                            style: TextStyle(
                                                color: marketInk,
                                                fontSize: 20,
                                                fontWeight: FontWeight.w700)),
                                        SizedBox(height: 8),
                                        Text(
                                            'Fetching your authoritative balance and activity.',
                                            style: TextStyle(
                                                color: marketMuted,
                                                fontSize: 12)),
                                        SizedBox(height: 20)
                                      ]))),
                            if (s != null) ...[
                              _balanceHero(s, buyer),
                              const SizedBox(height: 16),
                              LayoutBuilder(builder: (context, c) {
                                final columns = c.maxWidth >= 760
                                    ? (buyer ? 4 : 3)
                                    : (c.maxWidth >= 340 ? 2 : 1);
                                final metrics = [
                                  FinanceMetric(
                                      label: buyer
                                          ? 'Held in escrow'
                                          : 'Pending escrow',
                                      amount: buyer ? s['held'] : s['pending'],
                                      icon: Icons.lock_outline_rounded,
                                      color: const Color(0xFF3A679B),
                                      caption: 'Committed to active orders'),
                                  FinanceMetric(
                                      label: 'Disputed escrow (held)',
                                      amount: s['disputed'],
                                      icon: Icons.shield_outlined,
                                      color: const Color(0xFFAD7526),
                                      caption:
                                          'Held until a dispute is resolved'),
                                  FinanceMetric(
                                      label: buyer
                                          ? 'Total simulated refunds'
                                          : 'Total simulated settlements',
                                      amount: buyer
                                          ? s['refunds']
                                          : s['settlements'],
                                      icon: buyer
                                          ? Icons.assignment_return_outlined
                                          : Icons.task_alt_rounded,
                                      caption:
                                          'Lifetime virtual funds received'),
                                  if (buyer)
                                    FinanceMetric(
                                        label: 'Unpaid pending checkouts',
                                        amount: s['pending_checkout'],
                                        icon: Icons.schedule_rounded,
                                        color: const Color(0xFF796299),
                                        caption:
                                            'Not yet funded from your wallet'),
                                ];
                                return Wrap(
                                    spacing: 12,
                                    runSpacing: 12,
                                    children: [
                                      for (final metric in metrics)
                                        SizedBox(
                                            width: (c.maxWidth -
                                                    (columns - 1) * 12) /
                                                columns,
                                            child: metric)
                                    ]);
                              }),
                              const SizedBox(height: 20),
                            ],
                            FinancePanel(
                                padding: 0,
                                child: ListTile(
                                    contentPadding: const EdgeInsets.symmetric(
                                        horizontal: 20, vertical: 10),
                                    leading: Container(
                                        padding: const EdgeInsets.all(11),
                                        decoration: BoxDecoration(
                                            color: const Color(0xFFEDF3EC),
                                            borderRadius:
                                                BorderRadius.circular(14)),
                                        child: const Icon(
                                            Icons.inventory_2_outlined,
                                            color: marketGreen)),
                                    title: Text(
                                        buyer
                                            ? 'My escrow orders'
                                            : 'My deliveries & allocations',
                                        style: const TextStyle(
                                            color: marketInk,
                                            fontWeight: FontWeight.w700)),
                                    subtitle: const Padding(
                                        padding: EdgeInsets.only(top: 5),
                                        child: Text(
                                            'Track delivery, held funds and settlement progress.',
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: marketMuted))),
                                    trailing: const Icon(Icons.arrow_forward_rounded, color: marketGreen),
                                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TransactionHistoryScreen())).then((_) {
                                          if (mounted) _load();
                                        }))),
                            const SizedBox(height: 24),
                            const FinanceSectionTitle('Wallet activity',
                                subtitle:
                                    'An auditable record of every virtual credit and purchase.'),
                            for (final p in _demoPayments.where(
                                (p) => p['status'] != 'CREDITED'))
                              ListTile(
                                  title: const Text(
                                      'Telebirr Demo Payment · Simulation'),
                                  subtitle: Text(
                                      '${p['amount']} ETB · ${p['status']}\n${p['reference']}\n${p['created_at']}'),
                                  onTap: () => Navigator.push(
                                              context,
                                              MaterialPageRoute(
                                                  builder: (_) =>
                                                      TelebirrDemoScreen(
                                                          payment: p,
                                                          api: _demoApi)))
                                          .then((_) {
                                        if (mounted) _load();
                                      })),
                            if (_history.isEmpty && !_busy)
                              const FinancePanel(
                                  padding: 0,
                                  child: MarketEmpty(
                                      icon: Icons.receipt_long_outlined,
                                      title: 'Your activity starts here',
                                      message:
                                          'No wallet activity yet. Pending allocations are listed under escrow orders.')),
                            if (_history.isNotEmpty)
                              FinancePanel(
                                  padding: 0,
                                  child: Column(children: [
                                    for (var i = 0;
                                        i < _history.length;
                                        i++) ...[
                                      if (i > 0)
                                        const Divider(
                                            height: 1,
                                            indent: 20,
                                            endIndent: 20),
                                      _activity(_history[i])
                                    ]
                                  ])),
                            if (_more)
                              Padding(
                                  padding: const EdgeInsets.only(top: 16),
                                  child: OutlinedButton.icon(
                                      onPressed: _busy
                                          ? null
                                          : () => _load(next: true),
                                      icon: const Icon(Icons.expand_more),
                                      label: const Text('Load more activity'))),
                          ]))),
            ]);
      })),
    ));
  }

  Widget _balanceHero(Map<String, dynamic> s, bool buyer) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
            gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF164C36), Color(0xFF23764E)]),
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                  color: marketGreen.withValues(alpha: .16),
                  blurRadius: 24,
                  offset: const Offset(0, 10))
            ]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.account_balance_wallet_outlined,
                color: Color(0xFFD3E9CD), size: 26),
            Spacer(),
            Text('VIRTUAL ETB',
                style: TextStyle(
                    color: Color(0xFFD3E9CD),
                    fontSize: 10,
                    letterSpacing: 1.8,
                    fontWeight: FontWeight.w700))
          ]),
          const SizedBox(height: 22),
          Text(
              buyer ? 'Available demo balance' : 'Available simulated earnings',
              style: const TextStyle(color: Color(0xFFDBEADF), fontSize: 13)),
          const SizedBox(height: 8),
          FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text('ETB ${walletMoney(s['available'])}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 38,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1))),
          const SizedBox(height: 10),
          Text(
              buyer
                  ? 'Ready for your next marketplace purchase.'
                  : 'Released after verified delivery. No real payouts.',
              style: const TextStyle(
                  color: Color(0xFFD3E4D7), fontSize: 12, height: 1.5)),
          if (buyer) ...[
            const SizedBox(height: 22),
            FilledButton.icon(
                style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFF0F5E9),
                    foregroundColor: const Color(0xFF164C36),
                    disabledBackgroundColor: const Color(0xFFCFD8CD),
                    disabledForegroundColor: const Color(0xFF536458)),
                onPressed:
                    _busy || s['top_up_enabled'] != true ? null : _addFunds,
                icon: const Icon(Icons.add_rounded, size: 20),
                label: const Text('Add Funds')),
            if (s['top_up_enabled'] != true)
              const Padding(
                  padding: EdgeInsets.only(top: 10),
                  child: Text('Demo top-ups are disabled in this environment.',
                      style:
                          TextStyle(color: Color(0xFFD3E4D7), fontSize: 12))),
            const SizedBox(height: 10),
            if (s['telebirr_uat_enabled'] == true)
              FilledButton.tonalIcon(
                  onPressed: _busy
                      ? null
                      : () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => const TelebirrFundingScreen())),
                  icon: const Icon(Icons.science_outlined),
                  label: const Text('Telebirr UAT Payment')),
          ],
        ]),
      );

  Widget _activity(Map<String, dynamic> e) {
    final debit = e['event_type'] == 'checkout_debit';
    final labels = {
      'demo_top_up': 'Demo top-up',
      'checkout_debit': 'Marketplace purchase',
      'farmer_settlement': 'Delivery settlement',
      'buyer_refund': 'Escrow refund'
    };
    final date = DateTime.tryParse(e['created_at'].toString())?.toLocal();
    final timestamp = date == null
        ? e['created_at'].toString()
        : '${MaterialLocalizations.of(context).formatMediumDate(date)} · ${TimeOfDay.fromDateTime(date).format(context)}';
    final reference =
        (e['simulation_reference'] ?? e['transaction_id'] ?? e['event_id'])
            .toString();
    return InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: e['transaction_id'] == null
            ? null
            : () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => EscrowStatusScreen(
                        transactionId: e['transaction_id']))),
        child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                      color: debit
                          ? const Color(0xFFF0F2F6)
                          : const Color(0xFFEBF3EC),
                      borderRadius: BorderRadius.circular(13)),
                  child: Icon(
                      debit
                          ? Icons.north_east_rounded
                          : Icons.south_west_rounded,
                      size: 20,
                      color: debit ? const Color(0xFF576577) : marketGreen)),
              const SizedBox(width: 12),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(
                        e['funding_label'] ??
                            labels[e['event_type']] ??
                            financeLabel(e['event_type']),
                        style: const TextStyle(
                            color: marketInk,
                            fontWeight: FontWeight.w700,
                            fontSize: 14)),
                    const SizedBox(height: 5),
                    Text(timestamp,
                        style:
                            const TextStyle(color: marketMuted, fontSize: 11)),
                    const SizedBox(height: 5),
                    Text('Ref. $reference',
                        style:
                            const TextStyle(color: marketMuted, fontSize: 11)),
                    const SizedBox(height: 10),
                    Text('ETB ${walletMoney(e['amount'])}',
                        style: TextStyle(
                            color: debit ? marketInk : marketGreen,
                            fontWeight: FontWeight.w800,
                            fontSize: 17)),
                  ])),
              const SizedBox(width: 6),
              const FinanceStatus('Completed'),
            ])));
  }
}
