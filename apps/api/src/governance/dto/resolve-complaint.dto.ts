import { IsString, MaxLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintStatus } from '@ktb/shared-types';

export class ResolveComplaintDto {
  @ApiProperty({ enum: [ComplaintStatus.RESOLVED, ComplaintStatus.DISMISSED, ComplaintStatus.ESCALATED] })
  @IsEnum([ComplaintStatus.RESOLVED, ComplaintStatus.DISMISSED, ComplaintStatus.ESCALATED])
  status!: ComplaintStatus;

  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() resolutionNotes?: string;
}
