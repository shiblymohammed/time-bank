import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateVolunteerAvailabilityDto {
  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isAvailableImmediate?: boolean;

  @ApiPropertyOptional({
    example: 7.5,
    default: 5.0,
    description: 'Max travel radius in kilometers',
  })
  @IsNumber()
  @Min(0.5)
  @Max(50.0)
  @IsOptional()
  maxTravelRadiusKm?: number;

  @ApiPropertyOptional({ example: ['4', '5', '12'], default: [] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  preferredWardNumbers?: string[];

  @ApiPropertyOptional({ example: 10.9982, description: 'Transient GPS latitude (valid 2h, D#58)' })
  @IsNumber()
  @Min(8.0)
  @Max(38.0)
  @IsOptional()
  transientLat?: number;

  @ApiPropertyOptional({ example: 75.9921, description: 'Transient GPS longitude' })
  @IsNumber()
  @Min(68.0)
  @Max(98.0)
  @IsOptional()
  transientLng?: number;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Consent for transient GPS usage',
  })
  @IsBoolean()
  @IsOptional()
  isGpsConsented?: boolean;

  @ApiPropertyOptional({
    example: 'House 14, Ward 4, Kottakkal',
    description: 'Verified residential address',
  })
  @IsString()
  @IsOptional()
  residentialAddressText?: string;

  @ApiPropertyOptional({ example: '4', description: 'Residential civic ward number' })
  @IsString()
  @IsOptional()
  residentialWardNumber?: string;

  @ApiPropertyOptional({ example: '676503', description: 'Residential 6-digit Indian PIN code' })
  @IsString()
  @IsOptional()
  residentialPostalCode?: string;

  @ApiPropertyOptional({ example: 10.9982, description: 'Residential base latitude' })
  @IsNumber()
  @Min(8.0)
  @Max(38.0)
  @IsOptional()
  residentialLat?: number;

  @ApiPropertyOptional({ example: 75.9921, description: 'Residential base longitude' })
  @IsNumber()
  @Min(68.0)
  @Max(98.0)
  @IsOptional()
  residentialLng?: number;
}
