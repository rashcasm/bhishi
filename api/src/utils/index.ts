/**
 * Utility functions for the Bhishi API.
 * @module
 */

import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';

export const toHexString = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Decode a bech32m unshielded address (mn_addr...) into contract UserAddress bytes. */
export const bech32ToUserAddress = (bech32: string, networkId: string): { bytes: Uint8Array } => {
  const parsed = MidnightBech32m.parse(bech32).decode(UnshieldedAddress, networkId);
  return { bytes: new Uint8Array(parsed.data) };
};

/** Short pseudonymous label for a member id hash, e.g. "member a3f9…c2". */
export const shortId = (hex: string): string =>
  hex.length >= 10 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex;

/** Deterministic friendly name from a member id hash (privacy-preserving display). */
const NAMES = [
  'Saffron', 'Indigo', 'Marigold', 'Peacock', 'Lotus', 'Banyan', 'Monsoon', 'Jasmine',
  'Turmeric', 'Sandal', 'Koel', 'Mango', 'Neem', 'Champa', 'Kesar', 'Mor',
];
export const friendlyName = (idHex: string): string => {
  const n = parseInt(idHex.slice(0, 8), 16) >>> 0;
  return `${NAMES[n % NAMES.length]}-${idHex.slice(0, 4)}`;
};

/** Format micro-NIGHT (10^6) as a NIGHT amount string. */
export const fmtNight = (micro: bigint): string => {
  const whole = micro / 1_000_000n;
  const frac = micro % 1_000_000n;
  if (frac === 0n) return whole.toLocaleString();
  return `${whole.toLocaleString()}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
};

export const NIGHT = 1_000_000n; // smallest units per NIGHT
