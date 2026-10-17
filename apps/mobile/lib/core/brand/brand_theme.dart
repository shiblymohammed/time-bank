import 'package:flutter/material.dart';

/// Configuration for white-label tenant branding (ITB-001, ITB-002, ITB-003).
class BrandConfig {
  final String tenantCode;
  final String appDisplayName;
  final Color primaryColor;
  final Color secondaryColor;
  final String? logoKey;

  const BrandConfig({
    required this.tenantCode,
    required this.appDisplayName,
    required this.primaryColor,
    required this.secondaryColor,
    this.logoKey,
  });

  /// Default Kottakkal Time Bank brand preset.
  static const kottakkal = BrandConfig(
    tenantCode: 'KOTTAKKAL',
    appDisplayName: 'Kottakkal Time Bank',
    primaryColor: Color(0xFF0D5C75),
    secondaryColor: Color(0xFFF59E0B),
  );

  /// Default Kozhikode Time Bank brand preset.
  static const kozhikode = BrandConfig(
    tenantCode: 'KOZHIKODE',
    appDisplayName: 'Kozhikode Time Bank',
    primaryColor: Color(0xFF1E3A8A),
    secondaryColor: Color(0xFF10B981),
  );

  /// Helper to convert a hex color string (e.g. #0D5C75) to Flutter [Color].
  static Color colorFromHex(String hexString, {Color fallback = const Color(0xFF0D5C75)}) {
    final clean = hexString.replaceAll('#', '').trim();
    if (clean.length == 6) {
      return Color(int.parse('FF$clean', radix: 16));
    } else if (clean.length == 8) {
      return Color(int.parse(clean, radix: 16));
    }
    return fallback;
  }

  /// Factory from API JSON payload.
  factory BrandConfig.fromJson(String tenantCode, Map<String, dynamic> json) {
    return BrandConfig(
      tenantCode: tenantCode,
      appDisplayName: json['appDisplayName'] as String? ?? 'Time Bank',
      primaryColor: colorFromHex(json['primaryColor'] as String? ?? '#0D5C75'),
      secondaryColor: colorFromHex(json['secondaryColor'] as String? ?? '#F59E0B'),
      logoKey: json['logoKey'] as String?,
    );
  }

  /// Builds a responsive, accessible Material 3 [ThemeData] (FR-UX-02).
  ThemeData toThemeData() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primaryColor,
        primary: primaryColor,
        secondary: secondaryColor,
        brightness: Brightness.light,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryColor,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(48), // Accessible touch target (FR-UX-02)
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.grey.shade100,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: primaryColor, width: 2),
        ),
      ),
    );
  }
}
