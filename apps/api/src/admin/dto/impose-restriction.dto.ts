import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { GlobalRestrictionType } from '@ktb/shared-types';

export class ImposeRestrictionDto {
  @ApiProperty({ description: 'Target user ID to restrict', example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsNotEmpty()
  @IsUUID()
  userId!: string;

  @ApiProperty({
    enum: GlobalRestrictionType,
    example: GlobalRestrictionType.TEMPORARY_SUSPENSION,
    description: 'Type of platform-wide restriction',
  })
  @IsNotEmpty()
  @IsEnum(GlobalRestrictionType)
  restrictionType!: GlobalRestrictionType;

  @ApiProperty({ example: 'FRAUD_SUSPICION', description: 'Administrative reason code' })
  @IsNotEmpty()
  @IsString()
  reasonCode!: string;

  @ApiPropertyOptional({ example: 'Suspended pending identity reverification', description: 'Administrative notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
