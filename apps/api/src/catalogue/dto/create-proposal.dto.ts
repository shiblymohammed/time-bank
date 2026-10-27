import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateOrgProposalDto {
  @ApiProperty({ description: 'Category UUID for proposal' })
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ example: 'Canal Embankment Cleanup Drive' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 150)
  proposedName!: string;

  @ApiProperty({ example: 'Cleaning community drainage channels before monsoon' })
  @IsString()
  @IsNotEmpty()
  @Length(10, 1000)
  description!: string;

  @ApiProperty({ example: 'High demand in ward 4 due to seasonal flood risk' })
  @IsString()
  @IsNotEmpty()
  @Length(10, 1000)
  justification!: string;

  @ApiPropertyOptional({ example: 3, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  suggestedMinVolunteers?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsBoolean()
  @IsOptional()
  isHazardousPhysical?: boolean;
}
