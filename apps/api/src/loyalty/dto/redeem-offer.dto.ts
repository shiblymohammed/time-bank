import { IsString, IsOptional, IsUUID, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for redeeming a merchant offer (FR-LOY-04, D#21).
 * The member can redeem either by the offer ID (QR scan path) or by a one-time code
 * (manual entry fallback). Exactly one of the two methods must be provided.
 */
export class RedeemOfferDto {
  @ApiPropertyOptional({ description: 'Offer UUID — used for QR scan path' })
  @IsUUID()
  @IsOptional()
  offerId?: string;

  @ApiPropertyOptional({ description: 'One-time alphanumeric code — manual entry fallback' })
  @IsString()
  @Length(6, 12)
  @IsOptional()
  oneTimeCode?: string;
}
