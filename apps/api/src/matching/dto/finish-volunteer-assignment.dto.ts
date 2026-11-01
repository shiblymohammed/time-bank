import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class FinishVolunteerAssignmentDto {
  @ApiPropertyOptional({
    example: 75,
    description: 'Minutes of help given. Defaults to the time since the service started.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  minutes?: number;

  @ApiPropertyOptional({ example: 'Bought groceries and medicines.' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;
}
