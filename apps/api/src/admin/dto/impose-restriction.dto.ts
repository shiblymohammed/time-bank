import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';
import { GlobalRestrictionType } from '@ktb/shared-types';

export class ImposeRestrictionDto {
  @ApiPropertyOptional({
    description: 'Target user ID to restrict. Or use member.',
    example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @ValidateIf((dto: ImposeRestrictionDto) => !dto.member)
  @IsNotEmpty()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: "The person's phone or member number" })
  @IsOptional()
  @IsString()
  @Length(3, 50)
  member?: string;

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

  @ApiPropertyOptional({
    example: 'Suspended pending identity reverification',
    description: 'Administrative notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'What the person is told. Name no one and no complaint.' })
  @IsOptional()
  @IsString()
  @Length(10, 1000)
  memberMessage?: string;

  @ApiPropertyOptional({
    description: 'Staff are reminded then. Access does not return by itself.',
  })
  @IsOptional()
  @IsDateString()
  reviewOn?: string;
}
