import { IsString, IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBrandingDto {
  @ApiPropertyOptional({ example: 'Kozhikode Time Bank' })
  @IsString()
  @IsOptional()
  appDisplayName?: string;

  @ApiPropertyOptional({ example: 'logos/kozhikode-seal.png' })
  @IsString()
  @IsOptional()
  logoKey?: string;

  @ApiPropertyOptional({ example: '#0D5C75' })
  @IsString()
  @IsOptional()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'primaryColor must be a valid hex color code (e.g. #0D5C75)',
  })
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#F59E0B' })
  @IsString()
  @IsOptional()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'secondaryColor must be a valid hex color code (e.g. #F59E0B)',
  })
  secondaryColor?: string;

  @ApiPropertyOptional({ example: 'support@kozhikodetimebank.in' })
  @IsString()
  @IsOptional()
  supportEmail?: string;

  @ApiPropertyOptional({ example: { typography: 'Inter', radius: 8 } })
  @IsOptional()
  themeConfig?: Record<string, unknown>;
}
