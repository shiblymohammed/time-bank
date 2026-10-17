import { IsString, IsOptional, IsEnum, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationStatus } from '@ktb/shared-types';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Kozhikode Municipal Corporation (Updated)' })
  @IsString()
  @IsOptional()
  @Length(2, 200)
  name?: string;

  @ApiPropertyOptional({
    enum: OrganizationStatus,
    example: OrganizationStatus.ACTIVE,
  })
  @IsEnum(OrganizationStatus)
  @IsOptional()
  status?: OrganizationStatus;

  @ApiPropertyOptional({ example: 'Kozhikode' })
  @IsString()
  @IsOptional()
  district?: string;
}
