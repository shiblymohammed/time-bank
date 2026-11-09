import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { IdentityDocumentType } from '@ktb/shared-types';
import { normalizeDocumentNumber, PeopleService } from './people.service';

describe('normalizeDocumentNumber', () => {
  it('ignores spaces and dashes', () => {
    expect(normalizeDocumentNumber(IdentityDocumentType.AADHAAR_CARD, '1234 5678-9012')).toBe(
      '123456789012',
    );
  });

  it('wants 12 digits for Aadhaar', () => {
    expect(() => normalizeDocumentNumber(IdentityDocumentType.AADHAAR_CARD, '12345')).toThrow(
      BadRequestException,
    );
  });
});

describe('PeopleService.decideIdentity', () => {
  const member = { id: 'm-1', user_id: 'u-1', membership_number: 'KTB-1', full_name: 'Asha' };
  const setup = (duplicate: unknown) => {
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('document_fingerprint = $1')) return duplicate ? [duplicate] : [];
        if (sql.includes('RETURNING')) return [[{ verified_at: new Date() }], 1];
        return [];
      }),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([member]),
      transaction: jest.fn((fn: (m: typeof manager) => unknown) => fn(manager)),
    };
    const config = { get: jest.fn((key: string) => (key === 'JWT_SECRET' ? 'secret' : undefined)) };
    const audit = { logEvent: jest.fn() };
    const service = new PeopleService(dataSource as never, config as never, audit as never);
    return { service, audit, manager };
  };
  const verify = {
    decision: 'VERIFY' as const,
    documentType: IdentityDocumentType.AADHAAR_CARD,
    documentNumber: '1234 5678 9012',
  };

  it('keeps only the last 4 digits and a fingerprint', async () => {
    const { service, manager } = setup(null);
    await expect(service.decideIdentity('org', 'm-1', 'staff', verify)).resolves.toMatchObject({
      verificationStatus: 'VERIFIED',
      documentLast4: '9012',
    });
    const params = manager.query.mock.calls.flatMap(
      (call) => ((call as unknown[])[1] as unknown[]) ?? [],
    );
    expect(params).not.toContain('123456789012');
  });

  it('refuses a document that already verifies another account', async () => {
    const { service, audit } = setup({ user_id: 'u-2', membership_number: 'KTB-9' });
    await expect(service.decideIdentity('org', 'm-1', 'staff', verify)).rejects.toThrow(/KTB-9/);
    expect(audit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'IDENTITY_DUPLICATE_DOCUMENT' }),
    );
  });

  it('does not let staff verify themselves', async () => {
    const { service } = setup(null);
    await expect(service.decideIdentity('org', 'm-1', 'u-1', verify)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('needs a reason to reject', async () => {
    const { service } = setup(null);
    await expect(
      service.decideIdentity('org', 'm-1', 'staff', { decision: 'REJECT' }),
    ).rejects.toThrow(BadRequestException);
  });
});
