import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateServiceRequestDto } from './requests/dto/create-service-request.dto';
import { UpdateVolunteerAvailabilityDto } from './matching/dto/update-volunteer-availability.dto';
import { GrantBeneficiaryEligibilityDto } from './beneficiaries/dto/grant-beneficiary-eligibility.dto';
import { ConfigureOrgCatalogueDto } from './catalogue/dto/configure-org-catalogue.dto';
import { CreationChannel, UrgencyType, BeneficiaryEligibilityType } from '@ktb/shared-types';

const id = '00000000-0000-4000-8000-000000000001';
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});
const requestPayload = {
  serviceCatalogId: id,
  beneficiaryMembershipId: id,
  creationChannel: CreationChannel.DIRECT_BENEFICIARY,
  urgency: UrgencyType.SCHEDULED,
  scheduledStartTime: '2026-11-01T10:00:00Z',
  locationAddressText: 'Taluk Hospital',
  locationWardNumber: '14',
  locationPostalCode: '676503',
  beneficiaryNotes: '',
};
describe('client payload DTO contracts', () => {
  it.each([
    [CreateServiceRequestDto, requestPayload],
    [
      CreateServiceRequestDto,
      { ...requestPayload, creationChannel: CreationChannel.COORDINATOR_ON_BEHALF },
    ],
    [
      CreateServiceRequestDto,
      {
        ...requestPayload,
        creationChannel: CreationChannel.CAREGIVER_PROXY,
        caregiverAuthorizationId: id,
      },
    ],
    [
      UpdateVolunteerAvailabilityDto,
      { isAvailableImmediate: false, maxTravelRadiusKm: 3.5, preferredWardNumbers: ['14'] },
    ],
    [
      GrantBeneficiaryEligibilityDto,
      {
        membershipId: id,
        eligibilityType: Object.values(BeneficiaryEligibilityType)[0],
        reviewDueAt: '2027-10-29T10:00:00Z',
        monthlyRequestQuota: 8,
        approvedAssistanceCategories: ['*'],
      },
    ],
    [ConfigureOrgCatalogueDto, { globalServiceId: id, isEnabled: false }],
  ] as const)('accepts %p payload supplied by the clients', async (metatype, payload) => {
    await expect(pipe.transform(payload, { type: 'body', metatype })).resolves.toBeInstanceOf(
      metatype,
    );
  });
  it('rejects form strings in place of JSON booleans and numbers', async () => {
    await expect(
      pipe.transform(
        { isAvailableImmediate: 'false', maxTravelRadiusKm: '3.5' },
        { type: 'body', metatype: UpdateVolunteerAvailabilityDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
  it('rejects unknown fields rather than silently dropping client contract mistakes', async () => {
    await expect(
      pipe.transform(
        { ...requestPayload, serviceId: id },
        { type: 'body', metatype: CreateServiceRequestDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
