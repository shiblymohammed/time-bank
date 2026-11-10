import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipStatus, UserRole } from '@ktb/shared-types';
import { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { Roles } from '../authorization/decorators/roles.decorator';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { CaseNoteDto } from '../restrictions/dto/restriction.dto';
import { ConfirmPhoneRecoveryDto, OpenPhoneRecoveryDto } from './dto/phone-recovery.dto';
import { PhoneRecoveryService } from './phone-recovery.service';

const ipOf = (req: Request) => req.ip ?? req.socket.remoteAddress;
const contextOf = (req: Request): EvaluatedMembershipContext => (req as any).organizationMembership;

/** The route is limited to Super Admins, who reach every community. */
const centralContext = (userId: string): EvaluatedMembershipContext => ({
  userId,
  organizationId: '',
  membershipId: 'super-admin-bypass',
  membershipStatus: MembershipStatus.APPROVED,
  roles: [UserRole.SUPER_ADMIN],
  isSuperAdmin: true,
});

@ApiTags('Phone recovery')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, OrganizationAccessGuard)
@Controller('organizations/:id/phone-recoveries')
export class CommunityPhoneRecoveriesController {
  constructor(private readonly recoveries: PhoneRecoveryService) {}

  @Post()
  @ApiOperation({ summary: 'Staff who checked someone’s ID start moving their account to a new number' })
  open(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: OpenPhoneRecoveryDto,
    @Req() req: Request,
  ) {
    return this.recoveries.open(orgId, contextOf(req), dto, ipOf(req));
  }

  @Get()
  @ApiOperation({ summary: 'Cases at the levels this member of staff can read' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes ended ones' })
  list(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Query('open') open: string | undefined,
    @Req() req: Request,
  ) {
    return this.recoveries.list(orgId, contextOf(req), open !== 'false');
  }

  @Get(':caseId')
  detail(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Req() req: Request,
  ) {
    return this.recoveries.detail(orgId, caseId, contextOf(req));
  }

  @Post(':caseId/approve')
  @ApiOperation({ summary: 'Move the account to the new number' })
  approve(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.recoveries.approve(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/refuse')
  refuse(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.recoveries.refuse(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/withdraw')
  withdraw(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.recoveries.withdraw(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/notes')
  addNote(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.recoveries.addNote(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/reverse')
  @ApiOperation({ summary: 'A Super Admin undoes a move while the old number is still held' })
  reverse(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.recoveries.reverse(orgId, caseId, contextOf(req), dto, ipOf(req));
  }
}

@ApiTags('Phone recovery')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/phone-recoveries')
export class CentralPhoneRecoveriesController {
  constructor(private readonly recoveries: PhoneRecoveryService) {}

  @Get()
  @ApiOperation({ summary: 'Cases across every community' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes ended ones' })
  list(@Query('open') open: string | undefined, @CurrentUserId() userId: string) {
    return this.recoveries.list(null, centralContext(userId), open !== 'false');
  }

  @Get(':caseId')
  detail(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUserId() userId: string) {
    return this.recoveries.detail(null, caseId, centralContext(userId));
  }

  @Post(':caseId/approve')
  approve(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.recoveries.approve(null, caseId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':caseId/refuse')
  refuse(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.recoveries.refuse(null, caseId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':caseId/withdraw')
  withdraw(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.recoveries.withdraw(null, caseId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':caseId/notes')
  addNote(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.recoveries.addNote(null, caseId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':caseId/reverse')
  reverse(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.recoveries.reverse(null, caseId, centralContext(userId), dto, ipOf(req));
  }
}

/** For whoever holds the new number. Their account usually has no membership yet. */
@ApiTags('Phone recovery')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('me/phone-recovery')
export class MyPhoneRecoveryController {
  constructor(private readonly recoveries: PhoneRecoveryService) {}

  @Get()
  @ApiOperation({ summary: 'Any case moving an account to this phone, by reference only' })
  mine(@CurrentUserId() userId: string) {
    return this.recoveries.mine(userId);
  }

  @Post(':caseId/confirm')
  @ApiOperation({ summary: 'Prove this number with a fresh code' })
  confirm(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: ConfirmPhoneRecoveryDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.recoveries.confirm(userId, caseId, dto, ipOf(req));
  }

  @Post(':caseId/decline')
  @ApiOperation({ summary: 'Say this was not you, which ends the case' })
  decline(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.recoveries.decline(userId, caseId, ipOf(req));
  }
}
