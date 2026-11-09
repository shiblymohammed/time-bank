import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AppealOutcome, GlobalRestrictionType, RestrictionScope } from '@ktb/shared-types';

export class RecommendRestrictionDto {
  @ApiProperty({ description: 'The member number or phone number of someone in this community' })
  @IsString()
  @Length(3, 50)
  member!: string;

  @ApiProperty({
    enum: [GlobalRestrictionType.TEMPORARY_SUSPENSION, GlobalRestrictionType.PERMANENT_BAN],
  })
  @IsIn([GlobalRestrictionType.TEMPORARY_SUSPENSION, GlobalRestrictionType.PERMANENT_BAN])
  restrictionType!: GlobalRestrictionType;

  @ApiProperty({ description: 'The reason and evidence. Staff only.' })
  @IsString()
  @Length(10, 4000)
  reason!: string;

  @ApiPropertyOptional({ description: 'The reference of a complaint this comes from' })
  @IsOptional()
  @IsString()
  @Length(3, 30)
  complaintReference?: string;

  @ApiPropertyOptional({ description: 'The same value on a retry finds the case already made' })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  clientOperationId?: string;
}

export class ApproveRestrictionDto {
  @ApiProperty({ enum: RestrictionScope, description: 'A ban always covers every community' })
  @IsEnum(RestrictionScope)
  scope!: RestrictionScope;

  @ApiProperty({ description: 'The reason. Staff only.' })
  @IsString()
  @Length(3, 2000)
  notes!: string;

  @ApiProperty({ description: 'What the person is told. Name no one and no complaint.' })
  @IsString()
  @Length(10, 1000)
  memberMessage!: string;

  @ApiPropertyOptional({ description: 'Staff are reminded then. Access does not return by itself.' })
  @IsOptional()
  @IsDateString()
  reviewOn?: string;
}

export class CaseNoteDto {
  @ApiProperty({ description: 'Kept in the case history. The person does not see it.' })
  @IsString()
  @Length(3, 2000)
  notes!: string;
}

export class FileAppealDto {
  @ApiProperty({ description: 'Why the decision is wrong' })
  @IsString()
  @Length(10, 2000)
  grounds!: string;

  @ApiPropertyOptional({ description: 'The same value on a retry finds the appeal already made' })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  clientOperationId?: string;
}

export class DecideAppealDto {
  @ApiProperty({ enum: AppealOutcome })
  @IsEnum(AppealOutcome)
  outcome!: AppealOutcome;

  @ApiProperty({ description: 'The reason. Staff only.' })
  @IsString()
  @Length(3, 2000)
  notes!: string;

  @ApiProperty({ description: 'What the person is told' })
  @IsString()
  @Length(3, 1000)
  memberMessage!: string;
}
