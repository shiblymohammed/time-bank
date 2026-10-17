import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppBuildDto {
  @ApiPropertyOptional({ example: 'ANDROID', default: 'ANDROID' })
  @IsString()
  @IsOptional()
  platform?: string;

  @ApiProperty({
    example: 'in.gov.kerala.timebank.kozhikode',
    description: 'Android application ID / package name',
  })
  @IsString()
  @IsNotEmpty()
  applicationId!: string;

  @ApiPropertyOptional({ example: '1.0.0', default: '1.0.0' })
  @IsString()
  @IsOptional()
  buildVersion?: string;

  @ApiPropertyOptional({ example: '1.0.0', default: '1.0.0' })
  @IsString()
  @IsOptional()
  minSupportedVersion?: string;

  @ApiPropertyOptional({ example: 'RELEASED', default: 'DRAFT' })
  @IsString()
  @IsOptional()
  releaseStatus?: string;
}
