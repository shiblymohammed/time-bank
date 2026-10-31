import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

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
}
