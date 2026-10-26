import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, Matches, IsInt, Min } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'ELDER_CARE', description: 'Uppercase alphanumeric snake_case code' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 50)
  @Matches(/^[A-Z0-9_]+$/, { message: 'Code must be uppercase alphanumeric snake_case' })
  code!: string;

  @ApiProperty({ example: 'Elder Care & Accompaniment' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  nameEn!: string;

  @ApiProperty({ example: 'മുതിർന്നവർക്കുള്ള പരിചരണം' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  nameMl!: string;

  @ApiPropertyOptional({ example: 'Assistance for senior citizens with daily routine tasks' })
  @IsString()
  @IsOptional()
  descriptionEn?: string;

  @ApiPropertyOptional({ example: 'മുതിർന്ന പൗരന്മാർക്കുള്ള ദൈനംദിന സഹായം' })
  @IsString()
  @IsOptional()
  descriptionMl?: string;

  @ApiPropertyOptional({ example: 'elder_care_icon' })
  @IsString()
  @IsOptional()
  iconKey?: string;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;
}
