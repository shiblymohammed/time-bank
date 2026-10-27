import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ConfigureOrgCatalogueDto {
  @ApiProperty({ description: 'UUID of the GlobalServiceDefinition' })
  @IsUUID()
  @IsNotEmpty()
  globalServiceId!: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  minVolunteers?: number;

  @ApiPropertyOptional({ example: 2, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  preferredVolunteers?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsBoolean()
  @IsOptional()
  requiresCoordinatorDispatch?: boolean;

  @ApiPropertyOptional({ example: 'Local Hospital OP Escort' })
  @IsString()
  @IsOptional()
  customLabelEn?: string;

  @ApiPropertyOptional({ example: 'താലൂക്ക് ആശുപത്രി ഒപി സഹായം' })
  @IsString()
  @IsOptional()
  customLabelMl?: string;

  @ApiPropertyOptional({ example: 'Report to volunteer help desk at entrance' })
  @IsString()
  @IsOptional()
  localInstructionsEn?: string;

  @ApiPropertyOptional({ example: 'പ്രവേശന കവാടത്തിലുള്ള ഹെൽപ്പ് ഡെസ്കിൽ റിപ്പോർട്ട് ചെയ്യുക' })
  @IsString()
  @IsOptional()
  localInstructionsMl?: string;
}
