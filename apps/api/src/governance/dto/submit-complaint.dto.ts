import { IsString, MaxLength, IsEnum, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ComplaintTargetRole } from '@ktb/shared-types';

export class SubmitComplaintDto {
  @ApiProperty() @IsUUID() targetUserId!: string;
  @ApiProperty({ enum: ComplaintTargetRole }) @IsEnum(ComplaintTargetRole) targetRole!: ComplaintTargetRole;
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(300) subject!: string;
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(5000) description!: string;
}
