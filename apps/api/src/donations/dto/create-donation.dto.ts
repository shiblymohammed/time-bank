import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * A gift to one verified member (their organization and membership number)
 * or to one community pool, never both.
 */
export class CreateDonationDto {
  @ApiProperty({ example: 1.5, description: 'Credits to give, in hundredths' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  amount!: number;

  @ApiPropertyOptional({ description: 'Organization of the receiving member' })
  @IsUUID()
  @IsOptional()
  recipientOrganizationId?: string;

  @ApiPropertyOptional({ example: 'KTB-77' })
  @Transform(trimmed)
  @IsString()
  @Length(1, 50)
  @IsOptional()
  recipientMembershipNumber?: string;

  @ApiPropertyOptional({ description: 'Approved community pool' })
  @IsUUID()
  @IsOptional()
  poolId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @Transform(trimmed)
  @IsString()
  @Length(1, 200)
  @IsOptional()
  note?: string;

  @ApiProperty({ description: 'Client-generated key; a retry with the same key gives once' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @Length(8, 100)
  idempotencyKey!: string;
}
