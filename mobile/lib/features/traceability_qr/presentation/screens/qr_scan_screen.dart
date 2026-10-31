import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../delivery_qr.dart';
import '../../../../data/remote/transactions_api.dart';

class QrScanScreen extends StatefulWidget {
  const QrScanScreen(
      {super.key, this.transactionId, this.allocationId, this.api});
  final String? transactionId;
  final String? allocationId;
  final TransactionsApi? api;

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  bool _isProcessing = false;
  String? _errorMessage;
  MobileScannerController? _controller;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      autoStart: true,
      detectionSpeed: DetectionSpeed.normal,
    );
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _releaseEscrow(
      String transactionId, String allocationId, String qrToken) async {
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              scrollable: true,
              title: const Text('Confirm physical delivery'),
              content: const Text(
                  'Have you received the agreed quantity and checked quality? This records delivery only. Raise a dispute instead if there is a problem.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Not confirmed')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Quantity and quality confirmed')),
              ],
            ));
    if (!mounted || confirmed != true) {
      if (mounted) setState(() => _isProcessing = false);
      return;
    }
    setState(() {
      _isProcessing = true;
      _errorMessage = null;
    });

    try {
      await (widget.api ?? TransactionsApi()).action(
          transactionId,
          'allocations/$allocationId/verify-delivery',
          {'qr_token': qrToken, 'confirm_delivery': true});

      // ✅ Use the response to verify success
      if (mounted) {
        setState(() => _isProcessing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'Delivery confirmed. Demo funds remain held until simulated settlement. No real funds moved.'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = TransactionsApi.error(e);
          _isProcessing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan QR Code'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () => _controller?.toggleTorch(),
          ),
          IconButton(
            icon: const Icon(Icons.switch_camera),
            onPressed: () => _controller?.switchCamera(),
          ),
        ],
      ),
      body: SafeArea(
          top: false,
          child: Column(
            children: [
              // Scanner
              Expanded(
                flex: 3,
                child: Stack(
                  children: [
                    MobileScanner(
                      controller: _controller!,
                      onDetect: (capture) {
                        if (_isProcessing) return;
                        final List<Barcode> barcodes = capture.barcodes;
                        for (var barcode in barcodes) {
                          if (barcode.rawValue != null) {
                            _processQrData(barcode.rawValue!);
                            break;
                          }
                        }
                      },
                    ),
                    // Overlay with scan area
                    Center(
                      child: Container(
                        width: 200,
                        height: 200,
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.white, width: 4),
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                    // Loading overlay
                    if (_isProcessing)
                      Container(
                        color: Colors.black54,
                        child: const Center(
                          child: CircularProgressIndicator(),
                        ),
                      ),
                  ],
                ),
              ),

              // Status
              Expanded(
                flex: 1,
                child: LayoutBuilder(
                    builder: (context, constraints) => SingleChildScrollView(
                        key: const ValueKey('qr-scan-status-scroll'),
                        child: ConstrainedBox(
                            constraints: BoxConstraints(
                                minHeight: constraints.maxHeight),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    _errorMessage == null
                                        ? 'Position the QR code within the frame'
                                        : 'Delivery could not be verified',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(fontSize: 16),
                                  ),
                                  const SizedBox(height: 8),
                                  if (_errorMessage != null)
                                    Text(
                                      _errorMessage!,
                                      style: const TextStyle(color: Colors.red),
                                      textAlign: TextAlign.center,
                                    ),
                                  const SizedBox(height: 8),
                                  ElevatedButton.icon(
                                    onPressed:
                                        _isProcessing ? null : _restartScanner,
                                    icon: const Icon(Icons.refresh),
                                    label: const Text('Restart Scanner'),
                                  ),
                                ],
                              ),
                            )))),
              ),
            ],
          )),
    );
  }

  Future<void> _restartScanner() async {
    if (_isProcessing) return;
    setState(() => _errorMessage = null);
    try {
      await _controller?.start();
    } catch (e) {
      if (mounted) setState(() => _errorMessage = TransactionsApi.error(e));
    }
  }

  Future<void> _processQrData(String data) async {
    if (_isProcessing) return;
    setState(() {
      _isProcessing = true;
      _errorMessage = null;
    });
    try {
      await _controller?.stop();
      if (!mounted) return;
      final value = DeliveryQr.parse(data,
          transactionId: widget.transactionId,
          allocationId: widget.allocationId);
      await _releaseEscrow(
          value.transactionId, value.allocationId, value.token);
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Invalid QR code format';
        _isProcessing = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = TransactionsApi.error(e);
        _isProcessing = false;
      });
    }
  }
}
