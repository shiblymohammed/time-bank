import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateOperationalZoneDto {
  @ApiPropertyOptional({ example: 'North Coastal Ward Cluster' })
  @IsString()
  @Length(2, 100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description of wards' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: ['1', '2', '3', '4', '5', '6'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  wardNumbers?: string[];

  @ApiPropertyOptional({ example: 11.2588 })
  @IsNumber()
  @Min(8.0)
  @Max(38.0)
  @IsOptional()
  centerLat?: number;

  @ApiPropertyOptional({ example: 75.7804 })
  @IsNumber()
  @Min(68.0)
  @Max(98.0)
  @IsOptional()
  centerLng?: number;

  @ApiPropertyOptional({ example: 6.0 })
  @IsNumber()
  @Min(0.5)
  @Max(50.0)
  @IsOptional()
  radiusKm?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
