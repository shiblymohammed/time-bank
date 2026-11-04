import { IsString, IsNumber, Min, IsOptional, IsInt, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProposeOfferDto {
  @ApiProperty({ description: 'Short offer title' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'Full offer description' })
  @IsString()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ description: 'Loyalty coins required to redeem this offer' })
  @IsNumber()
  @Min(1)
  coinCost!: number;

  @ApiPropertyOptional({ description: 'Maximum total redemptions (null = unlimited)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxRedemptions?: number;

  @ApiProperty({ description: 'ISO-8601 date from which the offer is valid' })
  @IsDateString()
  validFrom!: string;

  @ApiProperty({ description: 'ISO-8601 date until which the offer is valid' })
  @IsDateString()
  validUntil!: string;
}
