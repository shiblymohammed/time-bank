import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'brand_theme.dart';

/// Provider for dynamic organization branding (ITB-003).
/// Allows switching between Kottakkal, Kozhikode, and custom onboarded municipalities.
final brandProvider = StateNotifierProvider<BrandNotifier, BrandConfig>((ref) {
  return BrandNotifier();
});

class BrandNotifier extends StateNotifier<BrandConfig> {
  BrandNotifier() : super(BrandConfig.kottakkal);

  void setBrand(BrandConfig config) {
    state = config;
  }

  void switchTenant(String tenantCode) {
    if (tenantCode.toUpperCase() == 'KOZHIKODE') {
      state = BrandConfig.kozhikode;
    } else {
      state = BrandConfig.kottakkal;
    }
  }
}
