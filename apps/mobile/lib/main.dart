/// Kottakkal Time Bank — Flutter Android App
///
/// Entry point for the member-facing mobile app.
///
/// D#93: Flutter mobile for volunteers/beneficiaries
/// D#94: Android first, iOS later
/// D#50: Malayalam and English at launch (FR-UX-01)
///
/// Milestone 1: Application shell only.
/// - No OTP login implemented yet (Milestone 2)
/// - No service workflows (Milestone 3+)
library;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // TODO(Milestone 2): Initialize Firebase for FCM push notifications
  // TODO(Milestone 2): Initialize flutter_secure_storage
  // TODO(Milestone 2): Initialize local SQLite database for offline queue

  runApp(
    // ProviderScope is the Riverpod root — must wrap the entire app
    const ProviderScope(
      child: KottakkalTimeBankApp(),
    ),
  );
}

/// Root application widget.
class KottakkalTimeBankApp extends ConsumerWidget {
  const KottakkalTimeBankApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'Kottakkal Time Bank',
      debugShowCheckedModeBanner: false,

      // FR-UX-01: Localization delegates for Malayalam + English
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        // TODO(Milestone 2): Add generated AppLocalizations.delegate
      ],
      supportedLocales: const [
        Locale('en'), // English
        Locale('ml'), // Malayalam
      ],

      // FR-UX-02: Accessible theme baseline
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1B5E20), // Deep green — toned for Kerala context
          brightness: Brightness.light,
        ),
        useMaterial3: true,
        // Ensure sufficient contrast ratios (FR-UX-02)
        textTheme: const TextTheme(
          bodyLarge: TextStyle(fontSize: 16, height: 1.5),
          bodyMedium: TextStyle(fontSize: 14, height: 1.5),
        ),
      ),

      // Milestone 1 placeholder home — replaced by GoRouter in Milestone 2
      home: const _FoundationPlaceholderPage(),
    );
  }
}

/// Temporary placeholder page confirming the Flutter shell is running.
/// Replaced in Milestone 2 with the OTP login flow (FR-IDENT-01).
class _FoundationPlaceholderPage extends StatelessWidget {
  const _FoundationPlaceholderPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Kottakkal Time Bank'),
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.volunteer_activism, size: 64, color: Color(0xFF1B5E20)),
            SizedBox(height: 16),
            Text(
              'Milestone 1 — Foundation',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            SizedBox(height: 8),
            Text(
              'OTP login and app workflows coming in Milestone 2.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }
}
