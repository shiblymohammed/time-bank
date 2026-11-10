import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Length } from 'class-validator';

/**
 * Sent with a visit change that a phone may have saved while offline (FR-OFF-01, FR-OFF-03).
 * The same operation ID on a retry returns the earlier result instead of doing it twice.
 */
export class VisitOperationDto {
  @ApiPropertyOptional({
    example: '3f1c0b8e-6a52-4f0e-9a51-2b6f3f7d9c10',
    description: 'Chosen by the phone. A retry with the same value is not done twice.',
  })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  clientOperationId?: string;

  @ApiPropertyOptional({
    example: '2026-11-10T04:30:00.000Z',
    description: 'When the person tapped it on the phone. Defaults to when the server receives it.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  occurredAt?: string;
}
