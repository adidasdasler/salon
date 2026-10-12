import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Minimal TOTP (RFC 6238) implementation — SHA1, 6 digits, 30s period.
 * Avoids extra dependency; compatible with Google Authenticator / Yandex Key.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Injectable()
export class TotpService {
  generateSecret(bytes = 20): string {
    return this.base32Encode(randomBytes(bytes));
  }

  /** otpauth:// URI for QR provisioning */
  buildUri(secret: string, email: string, issuer = 'Salon'): string {
    const label = encodeURIComponent(`${issuer}:${email}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
  }

  verify(secretB32: string, code: string, window = 1): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const now = Math.floor(Date.now() / 30_000);
    const given = Buffer.from(code);
    for (let i = -window; i <= window; i++) {
      // constant-time comparison to avoid side-channel leakage of the step match
      const expected = Buffer.from(this.codeAt(secretB32, now + i));
      if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
    }
    return false;
  }

  private atStep(secretB32: string, counter: number): Buffer {
    const key = this.base32Decode(secretB32);
    const buf = Buffer.alloc(8);
    let tmp = counter;
    for (let i = 7; i >= 0; i--) {
      buf[i] = tmp & 0xff;
      tmp = Math.floor(tmp / 256);
    }
    return createHmac('sha1', key).update(buf).digest();
  }

  private codeAt(secretB32: string, counter: number): string {
    const hash = this.atStep(secretB32, counter);
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset]! & 0x7f) << 24) |
      ((hash[offset + 1]! & 0xff) << 16) |
      ((hash[offset + 2]! & 0xff) << 8) |
      (hash[offset + 3]! & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
  }

  base32Encode(buf: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const b of buf) {
      value = (value << 8) | b;
      bits += 8;
      while (bits >= 5) {
        out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return out;
  }

  base32Decode(str: string): Buffer {
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of str.toUpperCase().replace(/=|\s/g, '')) {
      const idx = BASE32_ALPHABET.indexOf(ch);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(out);
  }
}
