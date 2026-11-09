import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LoyaltyMilestoneDto {
  @IsInt() @Min(1) @Max(60000000) minutes!: number;
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsInt() @Min(0) @Max(1000000) coins!: number;
}
export class LoyaltyPolicyDto {
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(0) @Max(1000000) coinsPerHour!: number;
  @IsInt() @Min(0) @Max(1000000) engagementCap!: number;
  @IsInt() @Min(0) @Max(1000000) campaignCapPerHour!: number;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LoyaltyMilestoneDto)
  milestones!: LoyaltyMilestoneDto[];
}
export class LoyaltyProgramDto {
  @IsBoolean() enabled!: boolean;
  @IsBoolean() leaderboardEnabled!: boolean;
}
export class LoyaltyPreferenceDto {
  @IsBoolean() optIn!: boolean;
  @IsOptional() @IsString() @MaxLength(60) displayName?: string;
}
export class EngagementAwardDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) member?: string;
  @IsInt() @Min(1) @Max(1000000) coins!: number;
  @IsString() @Matches(/\S/) @MinLength(5) @MaxLength(500) reason!: string;
  @IsUUID() clientOperationId!: string;
}
export class LoyaltyDecisionDto {
  @IsBoolean() approve!: boolean;
}
