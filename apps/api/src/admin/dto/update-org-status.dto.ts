import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OrganizationStatus } from '@ktb/shared-types';

export class UpdateOrgStatusDto {
  @ApiProperty({
    enum: OrganizationStatus,
    example: OrganizationStatus.ACTIVE,
    description: 'Target lifecycle status for the organization',
  })
  @IsNotEmpty()
  @IsEnum(OrganizationStatus)
  status!: OrganizationStatus;

  @ApiPropertyOptional({
    example: 'Municipal council onboarding verification complete',
    description: 'Administrative reason for changing the status',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
