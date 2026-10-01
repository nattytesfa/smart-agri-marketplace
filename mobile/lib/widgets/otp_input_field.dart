import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Segmented OTP entry field.
///
/// Renders one box per digit and keeps a single hidden [TextField] behind them.
/// That hidden field is what actually owns focus and text, so paste, autofill,
/// hardware keyboards and backspace all behave natively instead of being
/// re-implemented per box.
class OtpInputField extends StatefulWidget {
  const OtpInputField({
    super.key,
    this.length = 6,
    this.autofocus = false,
    this.enabled = true,
    this.hasError = false,
    this.onCompleted,
  });

  final int length;
  final bool autofocus;
  final bool enabled;
  final bool hasError;

  /// Called with the full code once every digit is entered.
  final ValueChanged<String>? onCompleted;

  @override
  State<OtpInputField> createState() => OtpInputFieldState();
}

class OtpInputFieldState extends State<OtpInputField> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  String get _code => _controller.text;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_handleChange);
    _focusNode.addListener(_handleFocusChange);
    if (widget.autofocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focusNode.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_handleChange)
      ..dispose();
    _focusNode
      ..removeListener(_handleFocusChange)
      ..dispose();
    super.dispose();
  }

  void _handleFocusChange() => setState(() {});

  void _handleChange() {
    setState(() {});

    final code = _code;
    if (code.length != widget.length) return;
    // Don't fire repeatedly while the user edits an already-complete code.
    if (widget.enabled) widget.onCompleted?.call(code);
    _focusNode.unfocus();
  }

  void _clear() {
    if (_controller.text.isEmpty) return;
    _controller.clear();
    _focusNode.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final hasFocus = _focusNode.hasFocus;
    final focusedIndex = hasFocus ? _code.length.clamp(0, widget.length - 1) : -1;
    final borderColor = widget.hasError
        ? Colors.red.shade700
        : const Color(0xFF2E7D32);

    return Semantics(
      label: 'One-time password',
      textField: true,
      child: GestureDetector(
        onTap: () {
          if (widget.enabled) _focusNode.requestFocus();
        },
        child: SizedBox(
          height: 60,
          child: Stack(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(widget.length, (index) {
                  final digit =
                      index < _code.length ? _code[index] : '';
                  final isFocused = index == focusedIndex;

                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: 46,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isFocused ? borderColor : Colors.grey.shade400,
                        width: isFocused ? 2 : 1,
                      ),
                      boxShadow: isFocused
                          ? [
                              BoxShadow(
                                color: borderColor.withValues(alpha: 0.18),
                                blurRadius: 8,
                              ),
                            ]
                          : null,
                    ),
                    child: Text(
                      digit,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                        color: Colors.black87,
                      ),
                    ),
                  );
                }),
              ),
              // Hidden field spans the boxes so taps anywhere focus it.
              Positioned.fill(
                child: Opacity(
                  opacity: 0,
                  child: TextField(
                    controller: _controller,
                    focusNode: _focusNode,
                    enabled: widget.enabled,
                    autofocus: widget.autofocus,
                    showCursor: false,
                    enableSuggestions: false,
                    autocorrect: false,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(widget.length),
                    ],
                    decoration: const InputDecoration(
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                    ),
                    onSubmitted: (_) => _focusNode.unfocus(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Clears the field. Exposed so the parent can reset after a failed verify.
  void reset() => _clear();
}
