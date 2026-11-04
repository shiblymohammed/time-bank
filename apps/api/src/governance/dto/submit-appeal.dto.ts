import { IsString, MaxLength, IsEnum, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AppealSubjectType } from '@ktb/shared-types';

export class SubmitAppealDto {
  @ApiProperty({ enum: AppealSubjectType }) @IsEnum(AppealSubjectType) subjectType!: AppealSubjectType;
  @ApiProperty() @IsUUID() subjectReferenceId!: string;
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(5000) grounds!: string;
}
