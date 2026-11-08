import { BadRequestException } from '@nestjs/common';

/**
 * Tidies a name as typed: trimmed, inner spaces collapsed. Any script is fine (Malayalam, Hindi,
 * English...), but it must contain letters and nothing that is not part of a name.
 */
export function cleanPersonName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 100 || !/\p{L}/u.test(name) || /[\p{Cc}<>{}\d@]/u.test(name)) {
    throw new BadRequestException('Enter your full name, as on your ID (2 to 100 letters)');
  }
  return name;
}
