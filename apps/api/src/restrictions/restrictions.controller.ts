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
import { AppealsService } from './appeals.service';
import {
  ApproveRestrictionDto,
  CaseNoteDto,
  DecideAppealDto,
  FileAppealDto,
  RecommendRestrictionDto,
} from './dto/restriction.dto';
import { RestrictionsService } from './restrictions.service';

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

@ApiTags('Restrictions')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, OrganizationAccessGuard)
@Controller('organizations/:id/restriction-cases')
export class RestrictionCasesController {
  constructor(
    private readonly restrictions: RestrictionsService,
    private readonly appeals: AppealsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Staff recommend suspending or banning a member' })
  recommend(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: RecommendRestrictionDto,
    @Req() req: Request,
  ) {
    return this.restrictions.recommend(orgId, contextOf(req), dto, ipOf(req));
  }

  @Get()
  @ApiOperation({ summary: 'Cases at the levels this member of staff can read' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes ended cases' })
  list(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Query('open') open: string | undefined,
    @Req() req: Request,
  ) {
    return this.restrictions.list(orgId, contextOf(req), open !== 'false');
  }

  @Get(':caseId')
  @ApiOperation({ summary: 'One case with its reason and history' })
  detail(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Req() req: Request,
  ) {
    return this.restrictions.detail(orgId, caseId, contextOf(req));
  }

  @Post(':caseId/approve')
  @ApiOperation({ summary: 'An administrator approves, and chooses how far it reaches' })
  approve(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: ApproveRestrictionDto,
    @Req() req: Request,
  ) {
    return this.restrictions.approve(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/refuse')
  @ApiOperation({ summary: 'An administrator refuses the recommendation' })
  refuse(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.restrictions.refuse(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/notes')
  @ApiOperation({ summary: 'Staff add to the case history' })
  addNote(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.restrictions.addNote(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/recommend-reinstatement')
  @ApiOperation({ summary: 'Staff recommend ending a suspension' })
  recommendReinstatement(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.restrictions.recommendReinstatement(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/refuse-reinstatement')
  @ApiOperation({ summary: 'An administrator refuses the reinstatement' })
  refuseReinstatement(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.restrictions.refuseReinstatement(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/reinstate')
  @ApiOperation({ summary: 'An administrator ends the suspension and access returns' })
  reinstate(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @Req() req: Request,
  ) {
    return this.restrictions.reinstate(orgId, caseId, contextOf(req), dto, ipOf(req));
  }

  @Post(':caseId/appeal')
  @ApiOperation({ summary: 'Staff file an appeal for someone who does not use the app' })
  appeal(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: FileAppealDto,
    @Req() req: Request,
  ) {
    return this.appeals.fileForMember(orgId, caseId, contextOf(req), dto, ipOf(req));
  }
}

@ApiTags('Restrictions')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, OrganizationAccessGuard)
@Controller('organizations/:id')
export class CommunityAppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Post('complaints/:complaintId/appeal')
  @ApiOperation({ summary: "A member challenges their complaint's outcome" })
  onComplaint(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() dto: FileAppealDto,
    @Req() req: Request,
  ) {
    return this.appeals.fileOnComplaint(orgId, complaintId, contextOf(req).userId, dto, ipOf(req));
  }

  @Get('appeals')
  @ApiOperation({ summary: 'Appeals at the levels this member of staff hears' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes decided appeals' })
  list(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Query('open') open: string | undefined,
    @Req() req: Request,
  ) {
    return this.appeals.list(orgId, contextOf(req), open !== 'false');
  }

  @Get('appeals/:appealId')
  @ApiOperation({ summary: 'One appeal, with the decision it challenges' })
  detail(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Req() req: Request,
  ) {
    return this.appeals.detail(orgId, appealId, contextOf(req));
  }

  @Post('appeals/:appealId/decide')
  @ApiOperation({ summary: 'Staff who took no part in the decision hear the appeal' })
  decide(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Body() dto: DecideAppealDto,
    @Req() req: Request,
  ) {
    return this.appeals.decide(orgId, appealId, contextOf(req), dto, ipOf(req));
  }
}

@ApiTags('Restrictions')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin')
export class CentralRestrictionsController {
  constructor(
    private readonly restrictions: RestrictionsService,
    private readonly appeals: AppealsService,
  ) {}

  @Get('restriction-cases')
  @ApiOperation({ summary: 'Cases across every community' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes ended cases' })
  list(@Query('open') open: string | undefined, @CurrentUserId() userId: string) {
    return this.restrictions.list(null, centralContext(userId), open !== 'false');
  }

  @Get('restriction-cases/:caseId')
  detail(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUserId() userId: string) {
    return this.restrictions.detail(null, caseId, centralContext(userId));
  }

  @Post('restriction-cases/:caseId/approve')
  approve(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: ApproveRestrictionDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.restrictions.approve(null, caseId, centralContext(userId), dto, ipOf(req));
  }

  @Post('restriction-cases/:caseId/refuse')
  refuse(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.restrictions.refuse(null, caseId, centralContext(userId), dto, ipOf(req));
  }

  @Post('restriction-cases/:caseId/notes')
  addNote(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.restrictions.addNote(null, caseId, centralContext(userId), dto, ipOf(req));
  }

  @Post('restriction-cases/:caseId/recommend-reinstatement')
  recommendReinstatement(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.restrictions.recommendReinstatement(
      null,
      caseId,
      centralContext(userId),
      dto,
      ipOf(req),
    );
  }

  @Post('restriction-cases/:caseId/refuse-reinstatement')
  refuseReinstatement(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.restrictions.refuseReinstatement(
      null,
      caseId,
      centralContext(userId),
      dto,
      ipOf(req),
    );
  }

  @Post('restriction-cases/:caseId/reinstate')
  reinstate(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CaseNoteDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.restrictions.reinstate(null, caseId, centralContext(userId), dto, ipOf(req));
  }

  @Get('appeals')
  @ApiOperation({ summary: 'Appeals across every community' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes decided appeals' })
  appealList(@Query('open') open: string | undefined, @CurrentUserId() userId: string) {
    return this.appeals.list(null, centralContext(userId), open !== 'false');
  }

  @Get('appeals/:appealId')
  appealDetail(@Param('appealId', ParseUUIDPipe) appealId: string, @CurrentUserId() userId: string) {
    return this.appeals.detail(null, appealId, centralContext(userId));
  }

  @Post('appeals/:appealId/decide')
  decideAppeal(
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Body() dto: DecideAppealDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.appeals.decide(null, appealId, centralContext(userId), dto, ipOf(req));
  }
}

/** The routes a restricted sign-in can reach (see RESTRICTED_ROUTES in auth.guard). */
@ApiTags('Restrictions')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('me/restriction')
export class MyRestrictionController {
  constructor(private readonly appeals: AppealsService) {}

  @Get()
  @ApiOperation({
    summary: "What restricts this person, what they are told, and whether they can appeal",
  })
  mine(@CurrentUserId() userId: string) {
    return this.appeals.mine(userId);
  }

  @Post(':caseId/appeal')
  @ApiOperation({ summary: 'The person appeals, even while blocked' })
  appeal(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: FileAppealDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    return this.appeals.fileMine(userId, caseId, dto, ipOf(req));
  }
}
