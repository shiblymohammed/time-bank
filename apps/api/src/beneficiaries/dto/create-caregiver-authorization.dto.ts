import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { CaregiverRelationshipType } from '@ktb/shared-types';

export class CreateCaregiverAuthorizationDto {
  @ApiProperty({ description: 'Beneficiary organization membership UUID' })
  @IsUUID()
  @IsNotEmpty()
  beneficiaryMembershipId!: string;

  @ApiProperty({ description: 'Caregiver organization membership UUID' })
  @IsUUID()
  @IsNotEmpty()
  caregiverMembershipId!: string;

  @ApiProperty({
    enum: CaregiverRelationshipType,
    default: CaregiverRelationshipType.FAMILY_CHILD,
  })
  @IsEnum(CaregiverRelationshipType)
  @IsNotEmpty()
  relationshipType!: CaregiverRelationshipType;

  @ApiPropertyOptional({ description: 'UUID of supporting document (power of attorney / ration card)' })
  @IsUUID()
  @IsOptional()
  authorizationDocumentId?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  canInitiateRequests?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  canVerifyCompletions?: boolean;
}
