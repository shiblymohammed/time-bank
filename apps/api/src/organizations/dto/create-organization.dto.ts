import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  Matches,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationType } from '@ktb/shared-types';

export class InitialBrandingDto {
  @ApiProperty({ example: 'Kozhikode Time Bank' })
  @IsString()
  @IsNotEmpty()
  appDisplayName!: string;

  @ApiPropertyOptional({ example: '#0D5C75' })
  @IsString()
  @IsOptional()
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#F59E0B' })
  @IsString()
  @IsOptional()
  secondaryColor?: string;

  @ApiPropertyOptional({ example: 'support@kozhikodetimebank.in' })
  @IsString()
  @IsOptional()
  supportEmail?: string;

  @ApiPropertyOptional({ example: {} })
  @IsOptional()
  themeConfig?: Record<string, unknown>;
}

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'KOZHIKODE',
    description: 'Unique uppercase canonical identifier code for the organization',
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code must contain only uppercase letters, numbers, underscores, and hyphens',
  })
  code!: string;

  @ApiProperty({ example: 'Kozhikode Municipal Corporation' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  name!: string;

  @ApiProperty({
    enum: OrganizationType,
    example: OrganizationType.MUNICIPAL_CORPORATION,
  })
  @IsEnum(OrganizationType)
  type!: OrganizationType;

  @ApiPropertyOptional({ example: 'KL', default: 'KL' })
  @IsString()
  @IsOptional()
  stateCode?: string;

  @ApiProperty({ example: 'Kozhikode' })
  @IsString()
  @IsNotEmpty()
  district!: string;

  @ApiPropertyOptional({
    example: '+919876543210',
    description: 'Phone number of initial Municipality Admin to appoint (D#2)',
  })
  @IsString()
  @IsOptional()
  adminPhone?: string;

  @ApiPropertyOptional({ type: InitialBrandingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InitialBrandingDto)
  branding?: InitialBrandingDto;
}
