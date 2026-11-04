import { IsString, MaxLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppealStatus } from '@ktb/shared-types';

export class ReviewAppealDto {
  @ApiProperty({ enum: [AppealStatus.UPHELD, AppealStatus.DISMISSED] })
  @IsEnum([AppealStatus.UPHELD, AppealStatus.DISMISSED])
  status!: AppealStatus.UPHELD | AppealStatus.DISMISSED;

  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() outcomeNotes?: string;
}
