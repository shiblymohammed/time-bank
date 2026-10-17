import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DocumentReviewStatus } from '@ktb/shared-types';

export class ReviewMembershipDocDto {
  @ApiProperty({
    enum: DocumentReviewStatus,
    example: DocumentReviewStatus.APPROVED,
    description: 'Updated review status for the document',
  })
  @IsNotEmpty()
  @IsEnum(DocumentReviewStatus)
  status!: DocumentReviewStatus;

  @ApiPropertyOptional({
    example: 'Proof of address verified matching ward register',
    description: 'Reviewer comments or verification notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
