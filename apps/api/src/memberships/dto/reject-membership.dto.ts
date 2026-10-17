import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectMembershipDto {
  @ApiProperty({
    example: 'Applicant resides outside municipality boundaries',
    description: 'Mandatory reason for rejecting the membership application',
  })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
