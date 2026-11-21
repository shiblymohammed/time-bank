import {
  Equals,
  IsBoolean,
  IsIn,
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class NearbyAvailabilityDto {
  @ApiProperty()
  @IsUUID()
  areaId!: string;

  @ApiProperty({ enum: [15, 30, 60, 120] })
  @IsIn([15, 30, 60, 120])
  minutes!: number;

  @ApiProperty({
    description: 'Explicitly share approximate area availability until expiry',
    enum: [true],
  })
  @IsBoolean()
  @Equals(true)
  consent!: boolean;
}
export class NearbyAreaVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  visible!: boolean;
}

export class NearbyRequestsQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(20) ward?: string;
  @IsOptional() @IsUUID() category?: string;
  @IsOptional() @IsIn(['week', 'today']) when?: 'week' | 'today';
  @IsOptional() @IsIn(['soonest', 'newest']) sort?: 'soonest' | 'newest';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) offset?: number;
}
