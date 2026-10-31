import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../../../../data/remote/transactions_api.dart';
import 'escrow_status_screen.dart';
import 'package:dio/dio.dart';
import '../../../../services/auth_service.dart';
import '../../../listings/presentation/widgets/marketplace_ui.dart';
import '../widgets/finance_ui.dart';

class PaymentScreen extends StatefulWidget {
  final String listingId;
  final String farmerId;
  final double amount;
  final String cropType;
  final bool isBatch;
  final String? quantity;
  final TransactionsApi? api;

  const PaymentScreen({
    super.key,
    required this.listingId,
    required this.farmerId,
    required this.amount,
    required this.cropType,
    this.isBatch = false,
    this.quantity,
    this.api,
  });

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _requestId = const Uuid().v4();
  late final TextEditingController _quantity =
      TextEditingController(text: widget.quantity);
  @override
  void dispose() {
    _quantity.dispose();
    super.dispose();
  }

  bool _isLoading = false;
  String? _errorMessage;
  String? _selectedPaymentMethod;
  bool _accountAction = false;

  final List<String> _paymentMethods = ['Telebirr', 'CBE Birr', 'Demo Wallet'];

  Future<void> _initiatePayment() async {
    if (_selectedPaymentMethod == null) {
      setState(() => _errorMessage = 'Please select a payment method');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final transaction = await (widget.api ?? TransactionsApi()).initiate({
        if (widget.isBatch)
          'batch_id': widget.listingId
        else
          'listing_id': widget.listingId,
        'request_id': _requestId,
        if (!widget.isBatch && _quantity.text.trim().isNotEmpty)
          'quantity': _quantity.text.trim(),
        'payment_method':
            _selectedPaymentMethod!.toLowerCase().replaceAll(' ', '_'),
      });

      // ✅ Use the response to verify success
      if (transaction['transaction_id'] != null) {
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text(
                  'Prototype checkout recorded. Payment pending; no real funds collected or escrow funded.'),
              backgroundColor: Colors.green,
            ),
          );
          await Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                  builder: (_) => EscrowStatusScreen(
                      api: widget.api,
                      transactionId: transaction['transaction_id'])));
        }
      } else {
        throw 'Checkout creation failed';
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = TransactionsApi.error(e);
          _accountAction = e is AccountAccessException ||
              (e is DioException &&
                  [401, 403, 404].contains(e.response?.statusCode));
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MarketplaceTheme(
        child: Scaffold(
      appBar: AppBar(
        title: const Text('Checkout'),
      ),
      body: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 840),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                child: ListView(
                  children: [
                    const MarketIntro(
                        eyebrow: 'Secure demo checkout',
                        title: 'A fresh start to a fair deal.',
                        subtitle:
                            'Review your produce and choose how to fund your simulated order.'),
                    const SizedBox(height: 20),
                    const DemoFundsNotice(),
                    const SizedBox(height: 24),
                    const FinanceSectionTitle('Purchase details',
                        subtitle:
                            'The server confirms the exact quantity and total on the next screen.'),
                    if (!widget.isBatch)
                      TextField(
                          controller: _quantity,
                          enabled: !_isLoading,
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          decoration: const InputDecoration(
                              labelText: 'Purchase quantity (listing units)',
                              helperText:
                                  'Blank purchases all currently unreserved quantity')),
                    // Amount card
                    Card(
                      color: Colors.white,
                      elevation: 0,
                      margin: const EdgeInsets.only(top: 16),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                          side: const BorderSide(color: Color(0xFFE3E9E2))),
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          children: [
                            Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                    color: const Color(0xFFEEF3EB),
                                    borderRadius: BorderRadius.circular(18)),
                                child: const Icon(Icons.eco_outlined,
                                    color: marketGreen, size: 30)),
                            const SizedBox(height: 16),
                            Text(
                              widget.cropType,
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: marketInk,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Estimate: ETB ${widget.amount.toStringAsFixed(2)}',
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                                color: marketGreen,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              widget.isBatch
                                  ? 'Bulk Purchase'
                                  : 'Single Listing',
                              style: TextStyle(color: Colors.grey[600]),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 24),

                    // Payment method selection (using Radio + ListTile to avoid deprecation)
                    const FinanceSectionTitle('Select Payment Method',
                        subtitle:
                            'All options use the same protected, simulated escrow.'),
                    const SizedBox(height: 8),

                    ..._paymentMethods.map(
                      (method) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              decoration: BoxDecoration(
                                  color: _selectedPaymentMethod == method
                                      ? const Color(0xFFEDF5EC)
                                      : Colors.white,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                      color: _selectedPaymentMethod == method
                                          ? marketGreen
                                          : const Color(0xFFE3E9E2),
                                      width: _selectedPaymentMethod == method
                                          ? 1.5
                                          : 1)),
                              child: Material(
                                  type: MaterialType.transparency,
                                  borderRadius: BorderRadius.circular(16),
                                  clipBehavior: Clip.antiAlias,
                                  child: ListTile(
                                    contentPadding: const EdgeInsets.symmetric(
                                        horizontal: 14, vertical: 8),
                                    leading: Radio<String>(
                                      value: method,
                                      // ignore: deprecated_member_use
                                      groupValue: _selectedPaymentMethod,
                                      // ignore: deprecated_member_use
                                      onChanged: (value) {
                                        setState(() =>
                                            _selectedPaymentMethod = value);
                                      },
                                      activeColor: marketGreen,
                                    ),
                                    title: Text(
                                        method == 'Demo Wallet'
                                            ? 'Pay With Demo Wallet'
                                            : 'Simulated $method',
                                        style: const TextStyle(
                                            color: marketInk,
                                            fontWeight: FontWeight.w700,
                                            fontSize: 14)),
                                    subtitle: Padding(
                                        padding: const EdgeInsets.only(top: 5),
                                        child: Text(
                                            method == 'Demo Wallet'
                                                ? 'Use your available virtual ETB balance'
                                                : 'Demo provider payment · no real money',
                                            style: const TextStyle(
                                                color: marketMuted,
                                                fontSize: 12))),
                                    trailing: Icon(
                                        method == 'Demo Wallet'
                                            ? Icons
                                                .account_balance_wallet_outlined
                                            : Icons.phone_android_rounded,
                                        color: _selectedPaymentMethod == method
                                            ? marketGreen
                                            : marketMuted),
                                    onTap: () => setState(
                                        () => _selectedPaymentMethod = method),
                                  )))),
                    ),

                    const SizedBox(height: 24),

                    // Error message
                    if (_errorMessage != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: MarketNotice(
                            message: _errorMessage!, warning: true),
                      ),
                    if (_accountAction)
                      TextButton(
                          onPressed: _isLoading
                              ? null
                              : () async {
                                  await AuthService().discardSession();
                                  if (context.mounted) {
                                    Navigator.pushNamedAndRemoveUntil(
                                        context, '/login', (_) => false);
                                  }
                                },
                          child: const Text(
                              'Sign in with another account / register')),

                    // Pay button
                    ElevatedButton(
                      onPressed: _isLoading ? null : _initiatePayment,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: marketGreen,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14)),
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: _isLoading
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text(
                              'Review authoritative checkout',
                              style:
                                  TextStyle(fontSize: 18, color: Colors.white),
                            ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                        'You will review the authoritative total before confirming payment. Opening checkout does not fund escrow.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            color: marketMuted, fontSize: 12, height: 1.5)),
                  ],
                ),
              ))),
    ));
  }
}
