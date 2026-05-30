// =====================================================================
// Tenor — unified haptics
// =====================================================================
// One API. Native on iOS (Taptic Engine via Capacitor's Haptics
// plugin), Web Vibration API on Android Chrome, silent no-op on
// desktop / iOS Safari / anywhere else without support.
//
// Importing Capacitor at the top is safe on the web build too — the
// plugin's web fallback throws inside the call sites, which we guard.
// =====================================================================

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();
const canWebVibrate =
  typeof navigator !== 'undefined' && 'vibrate' in navigator;

/** A light tap — e.g. selecting an emotion chip. */
export function tap(): void {
  if (native) {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    return;
  }
  if (canWebVibrate) navigator.vibrate(12);
}

/** A subtler tap — e.g. deselecting a chip. */
export function softTap(): void {
  if (native) {
    void Haptics.selectionStart().catch(() => undefined);
    return;
  }
  if (canWebVibrate) navigator.vibrate(6);
}

/** Snap landed on a chip — small, satisfying tick. */
export function snap(): void {
  if (native) {
    void Haptics.selectionChanged().catch(() => undefined);
    return;
  }
  if (canWebVibrate) navigator.vibrate(8);
}

/** Submit confirmed / log saved — a success pulse. */
export function success(): void {
  if (native) {
    void Haptics.notification({ type: NotificationType.Success }).catch(
      () => undefined,
    );
    return;
  }
  if (canWebVibrate) navigator.vibrate([10, 40, 10]);
}

/** Something failed — a sharp warning. */
export function error(): void {
  if (native) {
    void Haptics.notification({ type: NotificationType.Error }).catch(
      () => undefined,
    );
    return;
  }
  if (canWebVibrate) navigator.vibrate([30, 50, 30]);
}
