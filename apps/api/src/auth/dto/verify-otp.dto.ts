import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    example: '+919876543210',
    description: '10-digit Indian mobile number or E.164 formatted number',
  })
  @IsNotEmpty()
  @IsString()
  phone!: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP verification code',
  })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code!: string;

  @ApiPropertyOptional({
    example: 'KOTTAKKAL',
    description: 'Branded organization code to initialize session tenant context',
  })
  @IsOptional()
  @IsString()
  organizationCode?: string;

  @ApiPropertyOptional({
    description: 'Client device information (OS, app version, device model)',
    example: { platform: 'android', appVersion: '1.0.0', deviceModel: 'Pixel 8' },
  })
  @IsOptional()
  deviceInfo?: Record<string, unknown>;
}
