import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class ReportPeriodQueryDto {
  @ApiPropertyOptional({ example: '2026-10', description: 'A month in India time' })
  @IsOptional()
  @Matches(MONTH, { message: 'Choose a month like 2026-10' })
  month?: string;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'First day of a date range' })
  @IsOptional()
  @Matches(DAY, { message: 'Choose a start date like 2026-10-01' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Last day of a date range' })
  @IsOptional()
  @Matches(DAY, { message: 'Choose an end date like 2026-10-31' })
  to?: string;
}

export class ReportDownloadQueryDto extends ReportPeriodQueryDto {
  @ApiProperty({ enum: ['pdf', 'xlsx', 'csv'] })
  @IsIn(['pdf', 'xlsx', 'csv'], { message: 'Choose PDF, Excel or CSV' })
  format!: 'pdf' | 'xlsx' | 'csv';
}

export class SponsorDownloadQueryDto {
  @ApiProperty({ enum: ['pdf', 'csv'] })
  @IsIn(['pdf', 'csv'], { message: 'Choose PDF or CSV' })
  format!: 'pdf' | 'csv';
}

export class GenerateSponsorReportDto {
  @ApiProperty({ example: '2026-10', description: 'A month that has ended, in India time' })
  @Matches(MONTH, { message: 'Choose a month like 2026-10' })
  month!: string;
}
