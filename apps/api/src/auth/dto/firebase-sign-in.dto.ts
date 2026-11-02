import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class FirebaseSignInDto {
  @ApiProperty({
    description: 'Fresh Firebase ID token from phone sign-in; never a client-supplied phone number',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16384)
  idToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  organizationCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  deviceInfo?: Record<string, unknown>;
}
