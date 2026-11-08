import { BadRequestException } from '@nestjs/common';
import { cleanPersonName } from './person-name';

describe('cleanPersonName', () => {
  it('tidies spaces', () => {
    expect(cleanPersonName('  Asha   Menon ')).toBe('Asha Menon');
  });

  it('accepts names in Malayalam', () => {
    expect(cleanPersonName('ആശ മേനോൻ')).toBe('ആശ മേനോൻ');
  });

  it.each(['', 'A', '12345', 'Asha <b>', 'asha@example.com', 'Asha\u0000'])(
    'refuses %j',
    (raw) => {
      expect(() => cleanPersonName(raw)).toThrow(BadRequestException);
    },
  );
});
