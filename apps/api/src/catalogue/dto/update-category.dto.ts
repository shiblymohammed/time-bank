import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Elder Care & Accompaniment' })
  @IsString()
  @IsOptional()
  @Length(2, 100)
  nameEn?: string;

  @ApiPropertyOptional({ example: 'മുതിർന്നവർക്കുള്ള പരിചരണം' })
  @IsString()
  @IsOptional()
  @Length(2, 100)
  nameMl?: string;

  @ApiPropertyOptional({ example: 'Assistance for senior citizens' })
  @IsString()
  @IsOptional()
  descriptionEn?: string;

  @ApiPropertyOptional({ example: 'മുതിർന്ന പൗരന്മാർക്കുള്ള സഹായം' })
  @IsString()
  @IsOptional()
  descriptionMl?: string;

  @ApiPropertyOptional({ example: 'elder_care_icon' })
  @IsString()
  @IsOptional()
  iconKey?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;
}
