import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ConfirmServiceCompletionDto {
  @ApiPropertyOptional({
    example: 60,
    description: 'Minutes confirmed. Defaults to, and may not exceed, the reported minutes.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  minutes?: number;

  @ApiPropertyOptional({ description: 'Explanation when the recipient adjusts the reported time.' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason?: string;
}
