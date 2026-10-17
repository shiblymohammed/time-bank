import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Normalizes input phone numbers to standard E.164 format.
 * Defaults to Indian country code (+91) if a 10-digit mobile number is provided.
 */
export function normalizeToE164(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    throw new BadRequestException('Phone number must be a valid non-empty string');
  }

  // Remove spaces, hyphens, dots, parentheses
  const cleaned = phone.replace(/[\s\-().]/g, '');

  // Case 1: Standard 10-digit Indian number starting with 6, 7, 8, or 9
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // Case 2: 11-digit number starting with 0 (e.g. 09876543210)
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned.substring(1)}`;
  }

  // Case 3: 12-digit number starting with 91 (e.g. 919876543210)
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Case 4: General E.164 international format (+ followed by 7 to 15 digits)
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return cleaned;
  }

  throw new BadRequestException(
    'Invalid phone number format. Provide a 10-digit Indian mobile number or standard E.164 format (+91XXXXXXXXXX)',
  );
}

/**
 * Computes SHA-256 hash of a string value (used for phones, OTPs, and refresh tokens).
 */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
