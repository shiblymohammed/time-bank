import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ComplaintOutcome, ComplaintSubject } from '@ktb/shared-types';

export class RaiseComplaintDto {
  @ApiProperty({ enum: ComplaintSubject, description: 'This decides who handles the complaint' })
  @IsEnum(ComplaintSubject)
  subject!: ComplaintSubject;

  @ApiProperty({ description: 'What happened' })
  @IsString()
  @Length(10, 2000)
  description!: string;

  @ApiPropertyOptional({ description: 'A visit the member was part of' })
  @IsOptional()
  @IsUUID()
  serviceRequestId?: string;

  @ApiPropertyOptional({
    description: 'The same value on a retry finds the complaint already made',
  })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  clientOperationId?: string;
}

export class ComplaintNoteDto {
  @ApiProperty({ description: 'Kept in the case history. The member does not see it.' })
  @IsString()
  @Length(3, 2000)
  notes!: string;
}

export class DecideComplaintDto {
  @ApiProperty({ enum: ComplaintOutcome })
  @IsEnum(ComplaintOutcome)
  outcome!: ComplaintOutcome;

  @ApiProperty({ description: 'The reason. Kept in the case history. The member does not see it.' })
  @IsString()
  @Length(3, 2000)
  notes!: string;

  @ApiProperty({ description: 'What the member is told' })
  @IsString()
  @Length(3, 1000)
  memberMessage!: string;
}
