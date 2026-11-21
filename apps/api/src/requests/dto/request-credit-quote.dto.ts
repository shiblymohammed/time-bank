import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class RequestCreditQuoteDto {
  @IsUUID()
  serviceCatalogId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  expectedDurationMinutes!: number;
}
