import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RemovePushDeviceDto {
  @ApiProperty({ description: 'Firebase Cloud Messaging token for this installation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;
}

export class RegisterPushDeviceDto extends RemovePushDeviceDto {
  @ApiProperty({ enum: ['ANDROID', 'IOS'] })
  @IsIn(['ANDROID', 'IOS'])
  platform!: string;
}
