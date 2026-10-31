import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../delivery_qr.dart';
import '../../../../data/remote/transactions_api.dart';

class QrGenerateScreen extends StatefulWidget {
  final String transactionId;
  final String? allocationId;

  const QrGenerateScreen(
      {super.key, required this.transactionId, this.allocationId});

  @override
  State<QrGenerateScreen> createState() => _QrGenerateScreenState();
}

class _QrGenerateScreenState extends State<QrGenerateScreen> {
  bool _isLoading = false;
  String? _qrToken;
  String? _errorMessage;
  String? _expiresAt;

  @override
  void initState() {
    super.initState();
    _generateQr();
  }

  Future<void> _generateQr() async {
    if (_isLoading) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      if (widget.allocationId == null) {
        throw 'Open an allocation from Orders to generate a delivery QR.';
      }
      final response = await TransactionsApi()
          .qr(widget.transactionId, widget.allocationId!);

      if (mounted) {
        setState(() {
          _qrToken = DeliveryQr(widget.transactionId, widget.allocationId!,
                  response['qr_token'])
              .encode();
          _expiresAt = response['expires_at'];
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = TransactionsApi.error(e);
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Generate QR Code'),
        backgroundColor: Colors.orange,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Center(
          child: SingleChildScrollView(
              child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text(
                'The buyer scans this single-use QR to confirm quantity and quality. It does not release real or simulated funds by itself.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 24),
              _isLoading
                  ? const CircularProgressIndicator()
                  : _errorMessage != null
                      ? Text('Error: $_errorMessage')
                      : _qrToken == null
                          ? const Text('No QR token generated')
                          : Container(
                              decoration: BoxDecoration(
                                border:
                                    Border.all(color: Colors.orange, width: 2),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              padding: const EdgeInsets.all(16),
                              child: QrImageView(
                                data: _qrToken!,
                                version: QrVersions.auto,
                                size: 200,
                              ),
                            ),
              const SizedBox(height: 24),
              if (_qrToken != null) ...[
                Text(
                  'Expires: $_expiresAt · Regenerating revokes the old QR.',
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const SizedBox(height: 8),
                const Text(
                    'If the buyer sees “QR expired”, regenerate this code and ask them to scan the new image. Restarting the scanner does not renew an expired QR.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12)),
                const SizedBox(height: 8),
                ElevatedButton.icon(
                  onPressed: _isLoading ? null : _generateQr,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Regenerate QR'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.orange,
                  ),
                ),
              ],
            ],
          )),
        ),
      ),
    );
  }
}
