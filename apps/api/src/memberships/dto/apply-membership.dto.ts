import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserRole } from '@ktb/shared-types';

export const APPLICATION_ROLES = [
  UserRole.VOLUNTEER,
  UserRole.BENEFICIARY,
  UserRole.CAREGIVER,
] as const;
export const USUAL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export const USUAL_TIMES = ['MORNING', 'AFTERNOON', 'EVENING'] as const;

/** How a volunteer applicant can help. Skills are claims until a coordinator verifies them. */
export class VolunteerApplicationDto {
  @ApiPropertyOptional({ default: 5, minimum: 0.5, maximum: 50 })
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(50)
  @IsOptional()
  maxTravelRadiusKm?: number;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  availableAtShortNotice?: boolean;

  @ApiPropertyOptional({ enum: USUAL_DAYS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(USUAL_DAYS, { each: true })
  @IsOptional()
  usualDays?: string[];

  @ApiPropertyOptional({ enum: USUAL_TIMES, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(USUAL_TIMES, { each: true })
  @IsOptional()
  usualTimes?: string[];

  @ApiPropertyOptional({
    example: ['FIRST_AID'],
    description: 'Skill codes from GET catalogue/skills',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  @IsOptional()
  skillCodes?: string[];
}

export class ApplyMembershipDto {
  @ApiPropertyOptional({
    example: 'Fathima Beevi',
    description: 'Full name, as on their ID. Required the first time someone joins anywhere.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'Resident of Kottakkal Ward 4 since 2018',
    description: 'Optional introductory note or address details from applicant',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;

  @ApiPropertyOptional({
    enum: APPLICATION_ROLES,
    description: 'What the applicant wants to do. The approver still chooses the role.',
  })
  @IsIn(APPLICATION_ROLES)
  @IsOptional()
  requestedRole?: UserRole;

  @ApiPropertyOptional({ type: VolunteerApplicationDto })
  @ValidateNested()
  @Type(() => VolunteerApplicationDto)
  @IsOptional()
  volunteer?: VolunteerApplicationDto;
}
