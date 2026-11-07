import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { AssignmentReviewDecision } from '@ktb/shared-types';

export class ResolveServiceReviewDto {
  @ApiProperty({ enum: AssignmentReviewDecision })
  @IsEnum(AssignmentReviewDecision)
  decision!: AssignmentReviewDecision;

  @ApiPropertyOptional({
    description: 'Minutes to pay. Required to pay for a visit the volunteer never finished.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  minutes?: number;

  @ApiProperty({ example: 'Spoke to both people. The visit took one hour.' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 500)
  notes!: string;
}
