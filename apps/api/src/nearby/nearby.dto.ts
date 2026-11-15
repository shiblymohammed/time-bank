import { Equals, IsBoolean, IsIn, IsUUID } from 'class-validator';
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
