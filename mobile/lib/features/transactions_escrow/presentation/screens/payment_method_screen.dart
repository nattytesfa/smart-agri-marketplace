import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../../../data/remote/listings_api.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class PaymentScreen extends StatefulWidget {
  final String listingId;
  final String farmerId;
  final double amount;
  final String cropType;
  final bool isBatch;

  const PaymentScreen({
    super.key,
    required this.listingId,
    required this.farmerId,
    required this.amount,
    required this.cropType,
    this.isBatch = false,
  });

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  bool _isLoading = false;
  String? _errorMessage;
  String? _selectedPaymentMethod;

  final List<String> _paymentMethods = ['Telebirr', 'CBE Birr'];

  Future<void> _initiatePayment() async {
    if (_selectedPaymentMethod == null) {
      setState(() => _errorMessage = 'Please select a payment method');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final token = await _storage.read(key: 'supabase_token');
    if (token == null) {
      setState(() {
        _errorMessage = 'Please login first';
        _isLoading = false;
      });
      return;
    }

    final baseUrl = listingApiBase;
    try {
      final response = await _dio.post(
        '$baseUrl/transactions/initiate',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
        data: {
          if (widget.isBatch)
            'batch_id': widget.listingId
          else
            'listing_id': widget.listingId,
          'farmer_id': widget.farmerId,
          'amount': widget.amount,
          'payment_method':
              _selectedPaymentMethod!.toLowerCase().replaceAll(' ', '_'),
        },
      );

      // ✅ Use the response to verify success
      if (response.statusCode == 201) {
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Payment initiated! Escrow locked.'),
              backgroundColor: Colors.green,
            ),
          );
          Navigator.pop(context, true);
        }
      } else {
        throw 'Initiation failed with status: ${response.statusCode}';
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Amount card
            Card(
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    Text(
                      widget.cropType,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Total: ETB ${widget.amount.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.green,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.isBatch ? 'Bulk Purchase' : 'Single Listing',
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Payment method selection (using Radio + ListTile to avoid deprecation)
            const Text(
              'Select Payment Method',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),

            ..._paymentMethods.map(
              (method) => ListTile(
                leading: Radio<String>(
                  value: method,
                  // ignore: deprecated_member_use
                  groupValue: _selectedPaymentMethod,
                  // ignore: deprecated_member_use
                  onChanged: (value) {
                    setState(() => _selectedPaymentMethod = value);
                  },
                  activeColor: Colors.green,
                ),
                title: Text(method),
                onTap: () => setState(() => _selectedPaymentMethod = method),
              ),
            ),

            const Spacer(),

            // Error message
            if (_errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  _errorMessage!,
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              ),

            // Pay button
            ElevatedButton(
              onPressed: _isLoading ? null : _initiatePayment,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _isLoading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text(
                      'Pay Now',
                      style: TextStyle(fontSize: 18, color: Colors.white),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
