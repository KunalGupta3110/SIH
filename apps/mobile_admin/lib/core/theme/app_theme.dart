// App-wide ThemeData.
//
// Type system: SpaceGrotesk (geometric, slightly technical grotesk) carries
// headings and UI labels; JetBrainsMono is reserved for anything that is
// literally a data readout — timestamps, coordinates, confidence scores —
// so numbers in this app always look like telemetry, not body copy.
// This split is the signature typographic move: it should be obvious at a
// glance which text is "the system talking in data" vs "the system talking
// in words."
library;

import 'package:flutter/material.dart';
import 'app_colors.dart';

class AppTheme {
  AppTheme._();

  static const String displayFont = 'SpaceGrotesk';
  static const String monoFont = 'JetBrainsMono';

  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.base,
      primaryColor: AppColors.sentinelCyan,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.sentinelCyan,
        secondary: AppColors.hazardAmber,
        error: AppColors.hazardRed,
        surface: AppColors.surface,
      ),
      textTheme: base.textTheme
          .apply(
            fontFamily: displayFont,
            bodyColor: AppColors.textPrimary,
            displayColor: AppColors.textPrimary,
          )
          .copyWith(
            headlineMedium: const TextStyle(
              fontFamily: displayFont,
              fontWeight: FontWeight.w700,
              fontSize: 26,
              letterSpacing: -0.5,
              color: AppColors.textPrimary,
            ),
            titleLarge: const TextStyle(
              fontFamily: displayFont,
              fontWeight: FontWeight.w700,
              fontSize: 20,
              color: AppColors.textPrimary,
            ),
            titleMedium: const TextStyle(
              fontFamily: displayFont,
              fontWeight: FontWeight.w500,
              fontSize: 16,
              color: AppColors.textPrimary,
            ),
            bodyMedium: const TextStyle(
              fontFamily: displayFont,
              fontSize: 14,
              color: AppColors.textSecondary,
              height: 1.4,
            ),
            labelSmall: const TextStyle(
              fontFamily: monoFont,
              fontSize: 11,
              letterSpacing: 0.4,
              color: AppColors.textSecondary,
            ),
          ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.base,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: displayFont,
          fontWeight: FontWeight.w700,
          fontSize: 20,
          color: AppColors.textPrimary,
        ),
        iconTheme: IconThemeData(color: AppColors.textPrimary),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.surfaceBorder, width: 1),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.surfaceBorder,
        thickness: 1,
        space: 1,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surface,
        selectedItemColor: AppColors.sentinelCyan,
        unselectedItemColor: AppColors.textSecondary,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.sentinelCyan,
          foregroundColor: AppColors.base,
          textStyle: const TextStyle(
            fontFamily: displayFont,
            fontWeight: FontWeight.w700,
            fontSize: 15,
          ),
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          elevation: 0,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.textPrimary,
          side: const BorderSide(color: AppColors.surfaceBorder),
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceRaised,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.surfaceBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.surfaceBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.sentinelCyan, width: 1.5),
        ),
        hintStyle: const TextStyle(color: AppColors.textDisabled),
      ),
    );
  }

  /// Monospace readout style — use for timestamps, coordinates, confidence
  /// scores, anything that is literally a number coming off a sensor.
  static const TextStyle readout = TextStyle(
    fontFamily: monoFont,
    fontSize: 13,
    color: AppColors.textSecondary,
    letterSpacing: 0.2,
  );

  static const TextStyle readoutEmphasis = TextStyle(
    fontFamily: monoFont,
    fontWeight: FontWeight.w500,
    fontSize: 13,
    color: AppColors.textPrimary,
    letterSpacing: 0.2,
  );
}
