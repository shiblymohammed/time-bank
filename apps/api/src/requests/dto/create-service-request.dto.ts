import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CreationChannel, UrgencyType } from '@ktb/shared-types';

export class CreateServiceRequestDto {
  @ApiProperty({ description: 'OrganizationServiceCatalog UUID' })
  @IsUUID()
  @IsNotEmpty()
  serviceCatalogId!: string;

  @ApiPropertyOptional({ description: 'Optional client idempotency key to prevent double bookings' })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Beneficiary organization membership UUID (mandatory if created by Caregiver or Coordinator)' })
  @IsUUID()
  @IsOptional()
  beneficiaryMembershipId?: string;

  @ApiPropertyOptional({ description: 'CaregiverAuthorization UUID (mandatory if creationChannel is CAREGIVER_PROXY)' })
  @IsUUID()
  @IsOptional()
  caregiverAuthorizationId?: string;

  @ApiPropertyOptional({
    enum: CreationChannel,
    default: CreationChannel.DIRECT_BENEFICIARY,
  })
  @IsEnum(CreationChannel)
  @IsOptional()
  creationChannel?: CreationChannel;

  @ApiProperty({ enum: UrgencyType, default: UrgencyType.IMMEDIATE })
  @IsEnum(UrgencyType)
  @IsNotEmpty()
  urgency!: UrgencyType;

  @ApiProperty({ example: '2026-10-20T10:00:00.000Z', description: 'Scheduled start time ISO string' })
  @IsISO8601()
  @IsNotEmpty()
  scheduledStartTime!: string;

  @ApiPropertyOptional({ example: 60, default: 60, description: 'Expected duration in minutes (15 to 480)' })
  @IsInt()
  @Min(15)
  @Max(480)
  @IsOptional()
  expectedDurationMinutes?: number;

  // Mandatory Manual Location Fields (D#59, FR-SVC-02)
  @ApiProperty({ example: 'Taluk Hospital OP Counter, Kottakkal', description: 'Mandatory manually entered location text (never auto-filled from profile)' })
  @IsString()
  @IsNotEmpty()
  @Length(5, 500)
  locationAddressText!: string;

  @ApiProperty({ example: '14', description: 'Municipal ward number' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  locationWardNumber!: string;

  @ApiPropertyOptional({ example: 'Near Main Pharmacy Counter' })
  @IsString()
  @IsOptional()
  locationLandmark?: string;

  @ApiProperty({ example: '676503', description: '6-digit Indian PIN code' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[1-9][0-9]{5}$/, { message: 'Must be a valid 6-digit Indian PIN code' })
  locationPostalCode!: string;

  @ApiPropertyOptional({ example: 10.9982, description: 'Optional transient map pin latitude' })
  @IsNumber()
  @Min(8.0)
  @Max(38.0)
  @IsOptional()
  locationLat?: number;

  @ApiPropertyOptional({ example: 75.9921, description: 'Optional transient map pin longitude' })
  @IsNumber()
  @Min(68.0)
  @Max(98.0)
  @IsOptional()
  locationLng?: number;

  @ApiPropertyOptional({ example: 'Needs wheelchair assistance from parking lot' })
  @IsString()
  @IsOptional()
  beneficiaryNotes?: string;

  @ApiPropertyOptional({ example: false, default: false, description: 'Allows cross-org volunteers for community drives (ITB-006)' })
  @IsBoolean()
  @IsOptional()
  allowsCrossOrgVolunteers?: boolean;
}
