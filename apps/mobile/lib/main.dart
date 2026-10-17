/// Indian Time Bank — White-Label Flutter Mobile App (ITB-001, ITB-002, ITB-003)
///
/// Multi-tenant branded mobile app foundation supporting Kottakkal, Kozhikode,
/// and dynamically onboarded municipalities with centralized universal wallet (D#17).
library;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/brand/brand_provider.dart';
import 'features/auth/screens/otp_login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(
    const ProviderScope(
      child: IndianTimeBankMobileApp(),
    ),
  );
}

/// Root application widget with dynamic white-label theme injection.
class IndianTimeBankMobileApp extends ConsumerWidget {
  const IndianTimeBankMobileApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = ref.watch(brandProvider);

    return MaterialApp(
      title: brand.appDisplayName,
      debugShowCheckedModeBanner: false,

      // FR-UX-01: Localization delegates
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('en'), // English
        Locale('ml'), // Malayalam
      ],

      // Dynamic white-label theme (ITB-003, FR-UX-02)
      theme: brand.toThemeData(),

      // Milestone 2 Entry point: Mobile OTP Authentication
      home: const OtpLoginScreen(),
    );
  }
}
