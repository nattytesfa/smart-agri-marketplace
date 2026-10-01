import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_agri_marketplace/widgets/otp_input_field.dart';

void main() {
  late GlobalKey<OtpInputFieldState> key;

  setUp(() => key = GlobalKey<OtpInputFieldState>());

  Future<void> pump(WidgetTester tester, {int length = 6}) {
    return tester.pumpWidget(MaterialApp(
      home: Scaffold(body: Center(child: OtpInputField(key: key, length: length))),
    ));
  }

  testWidgets('shows entered digits in their own box', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), '12');
    await tester.pump();
    expect(find.text('1'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('fires onCompleted exactly once when full', (tester) async {
    final calls = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: OtpInputField(key: key, onCompleted: calls.add),
        ),
      ),
    ));

    await tester.enterText(find.byType(TextField), '123456');
    await tester.pump();
    expect(calls, ['123456']);
  });

  testWidgets('does not fire while incomplete', (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(child: OtpInputField(key: key, onCompleted: (_) => calls++)),
      ),
    ));

    await tester.enterText(find.byType(TextField), '123');
    await tester.pump();
    expect(calls, 0);
  });

  testWidgets('honours a custom length', (tester) async {
    final calls = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: OtpInputField(key: key, length: 4, onCompleted: calls.add),
        ),
      ),
    ));

    await tester.enterText(find.byType(TextField), '123');
    await tester.pump();
    expect(calls, isEmpty);

    await tester.enterText(find.byType(TextField), '1234');
    await tester.pump();
    expect(calls, ['1234']);
  });

  testWidgets('strips non-digits', (tester) async {
    final calls = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: OtpInputField(key: key, onCompleted: calls.add),
        ),
      ),
    ));

    await tester.enterText(find.byType(TextField), '1a2b3c4d5e6');
    await tester.pump();
    expect(calls, ['123456']);
  });

  testWidgets('caps input at length', (tester) async {
    final calls = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: OtpInputField(key: key, onCompleted: calls.add),
        ),
      ),
    ));

    await tester.enterText(find.byType(TextField), '1234567899');
    await tester.pump();
    expect(calls, ['123456']);
  });

  testWidgets('reset clears digits', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), '123');
    await tester.pump();
    expect(find.text('1'), findsOneWidget);

    key.currentState!.reset();
    await tester.pump();
    expect(find.text('1'), findsNothing);
  });

  testWidgets('ignores input while disabled', (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: OtpInputField(
            key: key,
            enabled: false,
            onCompleted: (_) => calls++,
          ),
        ),
      ),
    ));

    await tester.enterText(find.byType(TextField), '123456');
    await tester.pump();
    expect(calls, 0);
  });
}
