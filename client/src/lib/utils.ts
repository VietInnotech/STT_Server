import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate or retrieve a stable device fingerprint stored in localStorage
export function getDeviceFingerprint(): string {
  const KEY = 'device-fingerprint';
  try {
    let fp = localStorage.getItem(KEY);
    if (fp && fp.length > 0) return fp;
    // Generate v4 UUID (fallback to random if crypto not available)
    const uuidv4 = () => {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        // RFC4122 version 4
        buf[6] = (buf[6] & 0x0f) | 0x40;
        buf[8] = (buf[8] & 0x3f) | 0x80;
        const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, '0'));
        return (
          hex.slice(0, 4).join('') +
          '-' + hex.slice(4, 6).join('') +
          '-' + hex.slice(6, 8).join('') +
          '-' + hex.slice(8, 10).join('') +
          '-' + hex.slice(10, 16).join('')
        );
      }
      // Very rare fallback
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };
    fp = uuidv4();
    localStorage.setItem(KEY, fp);
    return fp;
  } catch {
    // As a last resort, combine UA + screen size; not ideal but better than nothing
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    const scr = typeof window !== 'undefined' ? `${window.screen?.width}x${window.screen?.height}` : 'unknown';
    return `${ua}|${scr}`;
  }
}
