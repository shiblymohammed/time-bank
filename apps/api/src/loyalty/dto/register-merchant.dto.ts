import { IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterMerchantDto {
  @ApiProperty({ description: 'Business name of the merchant' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  merchantName!: string;

  @ApiProperty({ description: 'Contact phone number (E.164)' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Phone must be a valid E.164 number' })
  phone!: string;

  @ApiProperty({ description: 'Full business address' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address!: string;

  @ApiPropertyOptional({ description: 'Business category (e.g. Grocery, Pharmacy)' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  category?: string;
}
