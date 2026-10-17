import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApplyMembershipDto {
  @ApiPropertyOptional({
    example: 'Resident of Kottakkal Ward 4 since 2018',
    description: 'Optional introductory note or address details from applicant',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
