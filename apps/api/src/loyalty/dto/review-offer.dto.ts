import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MerchantOfferStatus } from '@ktb/shared-types';

export class ReviewOfferDto {
  @ApiProperty({ enum: [MerchantOfferStatus.ACTIVE, MerchantOfferStatus.REJECTED] })
  @IsEnum([MerchantOfferStatus.ACTIVE, MerchantOfferStatus.REJECTED])
  status!: MerchantOfferStatus.ACTIVE | MerchantOfferStatus.REJECTED;

  @ApiPropertyOptional({ description: 'Rejection reason (required when rejecting)' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  rejectionReason?: string;
}
