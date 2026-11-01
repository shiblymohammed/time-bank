import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CaregiverAuthorizationStatus } from '@ktb/shared-types';

export class ReviewCaregiverAuthorizationDto {
  @ApiProperty({
    enum: [CaregiverAuthorizationStatus.APPROVED, CaregiverAuthorizationStatus.REVOKED],
  })
  @IsEnum(CaregiverAuthorizationStatus)
  @IsNotEmpty()
  status!: CaregiverAuthorizationStatus.APPROVED | CaregiverAuthorizationStatus.REVOKED;

  @ApiPropertyOptional({ example: 'Authorized by municipal social welfare officer' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 'Beneficiary requested revocation' })
  @IsString()
  @IsOptional()
  revocationReason?: string;
}
