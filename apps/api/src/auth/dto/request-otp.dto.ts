import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({
    example: '+919876543210',
    description: '10-digit Indian mobile number or E.164 formatted number',
  })
  @IsNotEmpty()
  @IsString()
  phone!: string;
}
