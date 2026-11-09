import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class MerchantApplicationDto {
  @IsString() @Matches(/\S/) @MinLength(2) @MaxLength(150) name!: string;
  @IsString() @Matches(/\S/) @MinLength(5) @MaxLength(500) address!: string;
  @Matches(/^\+[1-9]\d{7,14}$/) phone!: string;
}
export class MerchantOfferDto {
  @IsString() @Matches(/\S/) @MinLength(2) @MaxLength(150) title!: string;
  @IsString() @Matches(/\S/) @MinLength(5) @MaxLength(1500) description!: string;
  @IsString() @Matches(/\S/) @MinLength(5) @MaxLength(1500) terms!: string;
  @IsInt() @Min(1) @Max(1000000) coins!: number;
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsISO8601({ strict: true }) endsAt!: string;
  @IsInt() @Min(1) @Max(1000000) redemptionLimit!: number;
  @IsOptional() @IsUUID() previousOfferId?: string;
  @IsUUID() clientOperationId!: string;
}
export class LoyaltyCampaignDto {
  @IsString() @Matches(/\S/) @MinLength(2) @MaxLength(120) title!: string;
  @IsInt() @Min(1) @Max(1000000) bonusPerHour!: number;
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsISO8601({ strict: true }) endsAt!: string;
  @IsUUID() clientOperationId!: string;
}
export class IssueRedemptionDto {
  @IsUUID() offerId!: string;
  @IsUUID() clientOperationId!: string;
}
export class ConsumeRedemptionDto {
  @IsString() @Matches(/\S/) @MinLength(12) @MaxLength(100) token!: string;
}
