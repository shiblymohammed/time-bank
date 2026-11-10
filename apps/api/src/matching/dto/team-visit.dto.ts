import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsString, Length } from 'class-validator';
import { VisitOperationDto } from './visit-operation.dto';

export class LeaveTeamVisitDto extends VisitOperationDto {
  @ApiProperty({ example: 'I have to collect my child from school.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class HandOverVisitDto {
  @ApiProperty({ example: 'I am unwell and cannot carry on.' })
  @IsString()
  @Length(3, 500)
  reason!: string;

  @ApiProperty({
    example: true,
    description: 'The volunteer has seen that only the volunteer who finishes earns credits.',
  })
  @IsBoolean()
  @Equals(true, { message: 'Confirm that you will not earn credits for this visit' })
  acknowledgeNoCredits!: boolean;
}

export class InviteTeammateDto {
  @ApiProperty({ example: 'KTB-000123', description: 'An exact membership number or phone number' })
  @IsString()
  @Length(3, 40)
  memberNumberOrPhone!: string;
}

export class StopReplacementSearchDto {
  @ApiProperty({ example: 'Spoke to the family; they do not need anyone else today.' })
  @IsString()
  @Length(3, 1000)
  notes!: string;
}
