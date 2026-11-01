import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateOperationalZoneDto {
  @ApiProperty({ example: 'ZONE_NORTH', description: 'Unique zone code within organization' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Zone code must contain uppercase letters, numbers, and underscores only',
  })
  code!: string;

  @ApiProperty({
    example: 'North Coastal Ward Cluster',
    description: 'Display name of operational zone',
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name!: string;

  @ApiPropertyOptional({ example: 'Covers northern municipal wards along NH-66' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: ['1', '2', '3', '4', '5'],
    description: 'Civic ward numbers belonging to this zone',
  })
  @IsArray()
  @IsString({ each: true })
  wardNumbers!: string[];

  @ApiPropertyOptional({ example: 11.2588, description: 'Center point latitude' })
  @IsNumber()
  @Min(8.0)
  @Max(38.0)
  @IsOptional()
  centerLat?: number;

  @ApiPropertyOptional({ example: 75.7804, description: 'Center point longitude' })
  @IsNumber()
  @Min(68.0)
  @Max(98.0)
  @IsOptional()
  centerLng?: number;

  @ApiPropertyOptional({
    example: 5.0,
    default: 5.0,
    description: 'Operational coverage radius in km',
  })
  @IsNumber()
  @Min(0.5)
  @Max(50.0)
  @IsOptional()
  radiusKm?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
