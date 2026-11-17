import { BadRequestException } from '@nestjs/common';

const BYTES_PER_SECOND = 32000;
export const MAX_VOICE_BYTES = 44 + BYTES_PER_SECOND * 45;

/** Accept only the bounded, canonical PCM produced by the member app. */
export function readInstantHelpVoice(bytes: Buffer): number {
  if (
    bytes.length <= 44 ||
    bytes.length > MAX_VOICE_BYTES ||
    bytes.length % 2 !== 0 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.readUInt32LE(4) !== bytes.length - 8 ||
    bytes.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
    bytes.readUInt32LE(16) !== 16 ||
    bytes.readUInt16LE(20) !== 1 ||
    bytes.readUInt16LE(22) !== 1 ||
    bytes.readUInt32LE(24) !== 16000 ||
    bytes.readUInt32LE(28) !== BYTES_PER_SECOND ||
    bytes.readUInt16LE(32) !== 2 ||
    bytes.readUInt16LE(34) !== 16 ||
    bytes.toString('ascii', 36, 40) !== 'data' ||
    bytes.readUInt32LE(40) !== bytes.length - 44
  ) {
    throw new BadRequestException('Record a valid voice note of up to 45 seconds');
  }
  return Math.ceil(((bytes.length - 44) / BYTES_PER_SECOND) * 1000);
}
