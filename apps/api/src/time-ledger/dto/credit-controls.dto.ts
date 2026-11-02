import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreditAmountDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  amount!: number;

  @Transform(trimmed)
  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;

  @Transform(trimmed)
  @IsString()
  @Length(5, 1000)
  reason!: string;
}

export class OpenCreditReviewDto extends CreditAmountDto {
  @IsUUID()
  sourceEntryId!: string;

  /** Evidence-linked downstream donation from a previously disputed source. */
  @IsOptional()
  @IsUUID()
  parentReviewId?: string;
}

export class InvestigateCreditReviewDto {
  @Transform(trimmed)
  @IsString()
  @Length(10, 2000)
  investigation!: string;
}

export class ResolveCreditReviewDto {
  @IsIn(['RELEASE', 'CORRECT'])
  decision!: 'RELEASE' | 'CORRECT';

  @Transform(trimmed)
  @IsString()
  @Length(10, 2000)
  resolution!: string;
}

export class SpendAssistanceCreditsDto extends CreditAmountDto {
  @IsOptional()
  @IsUUID()
  poolId?: string;
}

export class ChangeWalletStatusDto {
  @IsIn(['ACTIVE', 'FROZEN'])
  status!: 'ACTIVE' | 'FROZEN';

  @Transform(trimmed)
  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;

  @Transform(trimmed)
  @IsString()
  @Length(5, 1000)
  reason!: string;
}
