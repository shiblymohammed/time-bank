import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateGlobalServiceDefinitionDto {
  @ApiProperty({ description: 'UUID of parent ServiceCategory' })
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ example: 'HOSPITAL_ACCOMPANIMENT' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 60)
  @Matches(/^[A-Z0-9_]+$/, { message: 'Code must be uppercase alphanumeric snake_case' })
  code!: string;

  @ApiProperty({ example: 'Hospital & Clinic Accompaniment' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 150)
  nameEn!: string;

  @ApiProperty({ example: 'ആശുപത്രി സഹായം' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 150)
  nameMl!: string;

  @ApiPropertyOptional({ example: 'Accompanying patient to hospital, pharmacy or OP counter' })
  @IsString()
  @IsOptional()
  descriptionEn?: string;

  @ApiPropertyOptional({ example: 'ആശുപത്രിയിലേക്കും ഫാർമസിയിലേക്കുമുള്ള സഹായം' })
  @IsString()
  @IsOptional()
  descriptionMl?: string;

  @ApiProperty({ example: 1, default: 1, description: 'Minimum safe volunteer headcount (D#64)' })
  @IsInt()
  @Min(1)
  defaultMinVolunteers!: number;

  @ApiProperty({ example: 1, default: 1, description: 'Preferred volunteer headcount (D#64)' })
  @IsInt()
  @Min(1)
  defaultPreferredVolunteers!: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsBoolean()
  @IsOptional()
  isHazardousPhysical?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsBoolean()
  @IsOptional()
  requiresSkills?: boolean;

  @ApiPropertyOptional({ example: ['FIRST_AID'], default: [] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  @IsOptional()
  requiredSkillCodes?: string[];

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Strict disclaimer against emergency dispatch (D#26)',
  })
  @IsBoolean()
  @IsOptional()
  isEmergencyProhibited?: boolean;

  @ApiPropertyOptional({
    example: 1.0,
    default: 1.0,
    description: 'Base hourly time-credit award rate (PRD D#14)',
  })
  @IsOptional()
  baseCreditRateHourly?: number;

  @ApiPropertyOptional({
    example: 1.0,
    default: 1.0,
    description: 'Credit multiplier for hazardous or specialized service',
  })
  @IsOptional()
  creditMultiplier?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  allowPartialHours?: boolean;
}
