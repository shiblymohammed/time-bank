import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateGlobalServiceDefinitionDto {
  @ApiPropertyOptional({ example: 'Hospital & Clinic Accompaniment' })
  @IsString()
  @IsOptional()
  @Length(3, 150)
  nameEn?: string;

  @ApiPropertyOptional({ example: 'ആശുപത്രി സഹായം' })
  @IsString()
  @IsOptional()
  @Length(3, 150)
  nameMl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  descriptionEn?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  descriptionMl?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  defaultMinVolunteers?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @Min(1)
  @IsOptional()
  defaultPreferredVolunteers?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isHazardousPhysical?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  requiresSkills?: boolean;

  @ApiPropertyOptional({ example: ['FIRST_AID'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  @IsOptional()
  requiredSkillCodes?: string[];

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isEmergencyProhibited?: boolean;

  @ApiPropertyOptional({ example: 1.0 })
  @IsNumber()
  @IsOptional()
  baseCreditRateHourly?: number;

  @ApiPropertyOptional({ example: 1.25 })
  @IsNumber()
  @IsOptional()
  creditMultiplier?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  allowPartialHours?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
