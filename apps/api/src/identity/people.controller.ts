import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { IdentityDocumentType, UserRole } from '@ktb/shared-types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { IdentityDecision, PeopleService } from './people.service';

class NameDto {
  @IsString()
  @Length(1, 120)
  fullName!: string;
}

class IdentityDecisionDto {
  @IsIn(['VERIFY', 'REJECT'])
  decision!: IdentityDecision;

  @IsOptional()
  @IsIn(Object.values(IdentityDocumentType))
  documentType?: string;

  /** Used only to check the document and work out its last 4 digits and fingerprint. */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

const STAFF = [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN];

@ApiTags('People')
@ApiBearerAuth('JWT-auth')
@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Patch('auth/me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Correct your own full name' })
  setOwnName(@CurrentUserId() userId: string, @Body() dto: NameDto) {
    return this.people.setOwnName(userId, dto.fullName);
  }

  @Patch('organizations/:id/memberships/:membershipId/name')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(...STAFF)
  @ApiOperation({ summary: "Staff correct a member's name" })
  setMemberName(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentUserId() actorId: string,
    @Body() dto: NameDto,
    @Req() req: Request,
  ) {
    return this.people.setMemberName(orgId, membershipId, actorId, dto.fullName, req.ip);
  }

  @Post('organizations/:id/memberships/:membershipId/identity')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(...STAFF)
  @ApiOperation({ summary: "Record a coordinator's identity check of a member's ID document" })
  decideIdentity(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentUserId() actorId: string,
    @Body() dto: IdentityDecisionDto,
    @Req() req: Request,
  ) {
    return this.people.decideIdentity(orgId, membershipId, actorId, dto, req.ip);
  }
}
