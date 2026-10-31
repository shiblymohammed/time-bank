import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { BeneficiaryEligibilityType } from '@ktb/shared-types';

export class GrantBeneficiaryEligibilityDto {
  @ApiProperty({ description: 'Organization membership UUID to grant eligibility to' })
  @IsUUID()
  @IsNotEmpty()
  membershipId!: string;

  @ApiProperty({ enum: BeneficiaryEligibilityType, default: BeneficiaryEligibilityType.ONGOING })
  @IsEnum(BeneficiaryEligibilityType)
  @IsNotEmpty()
  eligibilityType!: BeneficiaryEligibilityType;

  @ApiPropertyOptional({ example: ['*'], default: ['*'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  approvedAssistanceCategories?: string[];

  @ApiProperty({
    example: '2027-10-18T00:00:00.000Z',
    description: 'Mandatory review due date (D#25)',
  })
  @IsISO8601()
  @IsNotEmpty()
  reviewDueAt!: string;

  @ApiPropertyOptional({ example: 8, default: 8, description: 'Monthly request quota (D#26)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  monthlyRequestQuota?: number;

  @ApiPropertyOptional({ example: 'Approved for post-operative recovery assistance' })
  @IsString()
  @IsOptional()
  quotaOverrideReason?: string;
}
