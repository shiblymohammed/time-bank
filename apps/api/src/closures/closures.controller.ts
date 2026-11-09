import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { AppealsService } from '../restrictions/appeals.service';
import { CaseNoteDto, FileAppealDto } from '../restrictions/dto/restriction.dto';
import { ClosuresService } from './closures.service';
import {
  ApproveClosureDto,
  RecommendTransferDto,
  RemoveNomineeDto,
  ReportClosureDto,
  SetNomineeDto,
} from './dto/closure.dto';
import { NomineeService } from './nominee.service';

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

@ApiTags('Account closures')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, OrganizationAccessGuard)
@Controller('organizations/:id/closures')
export class CommunityClosuresController {
  constructor(
    private readonly closures: ClosuresService,
    private readonly appeals: AppealsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Staff report a death or a duplicate account' })
  report(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: ReportClosureDto,
    @Req() req: Request,
  ) {
    return this.closures.report(orgId, contextOf(req), dto, ipOf(req));
  }

  @Get()
  @ApiOperation({ summary: 'Closures at the levels this member of staff can read' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes ended ones' })
  list(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Query('open') open: string | undefined,
    @Req() req: Request,
  ) {
    return this.closures.list(orgId, contextOf(req), open !== 'false');
  }

  @Get(':closureId')
  @ApiOperation({ summary: 'One closure with its accounts, nominee and history' })
  detail(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Req() req: Request,
  ) {
    return this.closures.detail(orgId, closureId, contextOf(req));
  }

  @Post(':closureId/approve')
  @ApiOperation({ summary: 'An administrator closes the account' })
  approve(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: ApproveClosureDto,
    @Req() req: Request,
  ) {
    return this.closures.approve(orgId, closureId, contextOf(req), dto, ipOf(req));
  }

  @Post(':closureId/refuse')
  @ApiOperation({ summary: 'An administrator refuses the report' })
  refuse(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.closures.refuse(orgId, closureId, contextOf(req), dto, ipOf(req));
  }

  @Post(':closureId/notes')
  addNote(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.closures.addNote(orgId, closureId, contextOf(req), dto, ipOf(req));
  }

  @Post(':closureId/dispute')
  @ApiOperation({ summary: 'Record a dispute about the nominee. No credits move until reviewed.' })
  dispute(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.closures.dispute(orgId, closureId, contextOf(req), dto, ipOf(req));
  }

  @Post(':closureId/resolve-dispute')
  @ApiOperation({ summary: 'A coordinator has reviewed the nominee' })
  resolveDispute(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.closures.resolveDispute(orgId, closureId, contextOf(req), dto, ipOf(req));
  }

  @Post(':closureId/recommend-transfer')
  @ApiOperation({
    summary: 'A coordinator has verified the nominee and recommends passing on the credits',
  })
  recommendTransfer(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: RecommendTransferDto,
    @Req() req: Request,
  ) {
    return this.closures.recommendTransfer(orgId, closureId, contextOf(req), dto, ipOf(req));
  }

  @Post(':closureId/refuse-transfer')
  refuseTransfer(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.closures.refuseTransfer(orgId, closureId, contextOf(req), dto, ipOf(req));
  }

  @Post(':closureId/approve-transfer')
  @ApiOperation({ summary: 'An administrator passes the credits on' })
  approveTransfer(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.closures.approveTransfer(orgId, closureId, contextOf(req), dto, ipOf(req));
  }

  @Post(':closureId/reopen')
  @ApiOperation({ summary: 'A Super Admin reopens an account closed by mistake' })
  reopen(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.closures.reopen(orgId, closureId, contextOf(req), dto, ipOf(req));
  }

  @Post(':closureId/appeal')
  @ApiOperation({ summary: 'Staff file an appeal for someone who does not use the app' })
  appeal(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: FileAppealDto,
    @Req() req: Request,
  ) {
    return this.appeals.fileClosureForMember(orgId, closureId, contextOf(req), dto, ipOf(req));
  }
}

@ApiTags('Account closures')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/closures')
export class CentralClosuresController {
  constructor(private readonly closures: ClosuresService) {}

  @Get()
  @ApiOperation({ summary: 'Closures across every community' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes ended ones' })
  list(@Query('open') open: string | undefined, @CurrentUserId() userId: string) {
    return this.closures.list(null, centralContext(userId), open !== 'false');
  }

  @Get(':closureId')
  detail(@Param('closureId', ParseUUIDPipe) closureId: string, @CurrentUserId() userId: string) {
    return this.closures.detail(null, closureId, centralContext(userId));
  }

  @Post(':closureId/approve')
  approve(
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: ApproveClosureDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.closures.approve(null, closureId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':closureId/refuse')
  refuse(
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.closures.refuse(null, closureId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':closureId/notes')
  addNote(
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.closures.addNote(null, closureId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':closureId/dispute')
  dispute(
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.closures.dispute(null, closureId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':closureId/resolve-dispute')
  resolveDispute(
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.closures.resolveDispute(null, closureId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':closureId/recommend-transfer')
  recommendTransfer(
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: RecommendTransferDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.closures.recommendTransfer(null, closureId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':closureId/refuse-transfer')
  refuseTransfer(
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.closures.refuseTransfer(null, closureId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':closureId/approve-transfer')
  approveTransfer(
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.closures.approveTransfer(null, closureId, centralContext(userId), dto, ipOf(req));
  }

  @Post(':closureId/reopen')
  reopen(
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.closures.reopen(null, closureId, centralContext(userId), dto, ipOf(req));
  }
}

/** A restricted sign-in cannot reach these: someone blocked cannot change who gets their credits. */
@ApiTags('Account closures')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('me/nominee')
export class MyNomineeController {
  constructor(private readonly nominees: NomineeService) {}

  @Get()
  @ApiOperation({ summary: 'Who this member has named to receive their credits' })
  mine(@CurrentUserId() userId: string) {
    return this.nominees.mine(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Name or change a nominee, with a fresh code to this member’s phone' })
  set(@Body() dto: SetNomineeDto, @CurrentUserId() userId: string, @Req() req: Request) {
    return this.nominees.set(userId, dto, ipOf(req));
  }

  @Post('remove')
  @ApiOperation({ summary: 'Remove the nominee, with a fresh code to this member’s phone' })
  remove(@Body() dto: RemoveNomineeDto, @CurrentUserId() userId: string, @Req() req: Request) {
    return this.nominees.remove(userId, dto, ipOf(req));
  }
}
