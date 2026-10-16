import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ktb_mobile/main.dart';

void main() {
  group('KottakkalTimeBankApp', () {
    testWidgets('renders app title and placeholder text', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: KottakkalTimeBankApp(),
        ),
      );

      // App bar title
      expect(find.text('Kottakkal Time Bank'), findsOneWidget);

      // Milestone 1 placeholder
      expect(find.text('Milestone 1 — Foundation'), findsOneWidget);
    });
  });
}
