import { IsUUID, IsInt, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for inviting a teammate to fill a remaining slot on a multi-volunteer
 * request (FR-TEAM-02, D#65).
 *
 * The inviter must be an already-accepted volunteer on the same request.
 * The invitee must be an approved volunteer in the same organization.
 */
export class InviteTeammateDto {
  @ApiProperty({ description: 'Membership ID of the volunteer to invite' })
  @IsUUID()
  inviteeMembershipId!: string;

  @ApiPropertyOptional({ description: 'Slot number to fill (defaults to next open slot)' })
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  slotNumber?: number;

  @ApiPropertyOptional({ description: 'Optional message to the teammate' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  message?: string;
}
