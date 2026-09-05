// Design tokens — color palette.
//
// Rationale (kept here instead of scattered as magic hex codes so the
// palette reads as a deliberate system, not Material defaults):
//
// This is a monitoring console, not a consumer app — the operator glances
// at it during a normal day and stares at it during an incident. The palette
// is built around that split:
//   - A near-black, slightly blue-tinted base so the screen disappears into
//     a dark room (most of these units sit on a wall or a guard's desk).
//   - One cool accent (Sentinel Cyan) for "system is alive / armed" — calm,
//     technical, never alarming.
//   - A two-tier hazard scale (Amber -> Red) so severity is encoded in hue,
//     not just label text: Amber = unverified/needs attention,
//     Red = confirmed fire/intruder/critical.
// Avoid pure black (#000) and pure white — both read as unfinished/default.
library;

import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  // --- Surfaces ---
  static const Color base = Color(0xFF0A0D12); // app background
  static const Color surface = Color(0xFF12161D); // cards, sheets
  static const Color surfaceRaised = Color(0xFF1A2029); // elevated cards
  static const Color surfaceBorder = Color(0xFF262E3A); // hairline dividers

  // --- Text ---
  static const Color textPrimary = Color(0xFFE7EAEE);
  static const Color textSecondary = Color(0xFF8D96A5);
  static const Color textDisabled = Color(0xFF565E6B);

  // --- Brand / status accent ---
  static const Color sentinelCyan = Color(0xFF35D6C4); // armed / online / active
  static const Color sentinelCyanDim = Color(0xFF1B6E64);
  static const Color offlineGray = Color(0xFF5B6472); // node offline / disarmed

  // --- Hazard scale ---
  static const Color hazardAmber = Color(0xFFF5A623); // unverified person, needs review
  static const Color hazardOrange = Color(0xFFFF7A45); // smoke detected
  static const Color hazardRed = Color(0xFFFF4757); // fire / intruder confirmed / critical
  static const Color hazardRedDim = Color(0xFF3A1620); // red surface tint for alarm cards

  // --- Confirmation ---
  static const Color safeGreen = Color(0xFF35C46A); // all clear / verified identity

  // Helper: map a threat type string to its severity color.
  static Color forThreatType(String type) {
    switch (type.toLowerCase()) {
      case 'fire':
        return hazardRed;
      case 'smoke':
        return hazardOrange;
      case 'unknown_person':
      case 'unverified_person':
        return hazardAmber;
      case 'verified_person':
        return safeGreen;
      default:
        return textSecondary;
    }
  }
}
