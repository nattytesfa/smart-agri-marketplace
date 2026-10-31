import 'package:flutter/material.dart';
import '../../../../data/remote/transactions_api.dart';
import '../../../listings/presentation/widgets/marketplace_ui.dart';
import 'escrow_status_screen.dart';
import '../widgets/finance_ui.dart';

class TransactionHistoryScreen extends StatefulWidget {
  const TransactionHistoryScreen({super.key});
  @override
  State<TransactionHistoryScreen> createState() =>
      _TransactionHistoryScreenState();
}

class _TransactionHistoryScreenState extends State<TransactionHistoryScreen> {
  final _api = TransactionsApi();
  late Future<List<Map<String, dynamic>>> _orders;
  @override
  void initState() {
    super.initState();
    _orders = _api.list();
  }

  Future<void> _refresh() async {
    setState(() => _orders = _api.list());
    try {
      await _orders;
    } catch (_) {
      // FutureBuilder renders the retryable network error.
    }
  }

  @override
  Widget build(BuildContext context) => MarketplaceTheme(
          child: Scaffold(
        appBar: AppBar(title: const Text('Orders & Escrow'), actions: [
          IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
        ]),
        body: FutureBuilder<List<Map<String, dynamic>>>(
            future: _orders,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return MarketEmpty(
                    icon: Icons.cloud_off_outlined,
                    title: 'Unable to load orders',
                    message: TransactionsApi.error(snapshot.error!),
                    action: FilledButton.icon(
                        onPressed: _refresh,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Try again')));
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              final orders = snapshot.data!;
              return RefreshIndicator(
                  onRefresh: _refresh,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: [
                      const MarketIntro(
                          eyebrow: 'Your marketplace activity',
                          title: 'From farm to fulfillment.',
                          subtitle:
                              'Follow your orders, deliveries and protected virtual funds in one place.'),
                      const SizedBox(height: 20),
                      const DemoFundsNotice(),
                      const SizedBox(height: 24),
                      FinanceSectionTitle('Your orders',
                          subtitle:
                              '${orders.length} recent orders · Tap an order for allocation details'),
                      if (orders.isEmpty)
                        const FinancePanel(
                            padding: 0,
                            child: MarketEmpty(
                                icon: Icons.inventory_2_outlined,
                                title: 'No orders yet',
                                message:
                                    'Start a buyer checkout from Browse or a filled Debo batch. Farmers will see their orders here once a buyer checks out.')),
                      for (final order in orders)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: FinancePanel(
                                padding: 0,
                                child: ListTile(
                                  contentPadding: const EdgeInsets.all(18),
                                  leading: Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                          color: const Color(0xFFEEF3EB),
                                          borderRadius:
                                              BorderRadius.circular(14)),
                                      child: const Icon(
                                          Icons.receipt_long_outlined,
                                          color: marketGreen)),
                                  title: Text(
                                      'ETB ${walletMoney(order['amount'] ?? order['balances']['paid'])}',
                                      style: const TextStyle(
                                          color: marketInk,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 19)),
                                  subtitle: Padding(
                                      padding: const EdgeInsets.only(top: 10),
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Wrap(
                                                spacing: 6,
                                                runSpacing: 6,
                                                children: [
                                                  FinanceStatus(
                                                      order['checkout_status']
                                                          .toString()),
                                                  FinanceStatus(
                                                      order['payment_status']
                                                          .toString(),
                                                      warning: order[
                                                              'payment_status'] ==
                                                          'pending')
                                                ]),
                                            const SizedBox(height: 10),
                                            Text(order['transaction_id'],
                                                style: const TextStyle(
                                                    fontSize: 10,
                                                    color: marketMuted,
                                                    fontFamily: 'monospace'))
                                          ])),
                                  trailing: const Icon(Icons.chevron_right,
                                      color: marketMuted),
                                  onTap: () async {
                                    await Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                            builder: (_) => EscrowStatusScreen(
                                                transactionId:
                                                    order['transaction_id'])));
                                    if (mounted) _refresh();
                                  },
                                ))),
                    ],
                  ));
            }),
      ));
}
