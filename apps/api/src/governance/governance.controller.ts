import {
  Controller, Get, Post, Patch, Param, Body,
  Req, UseGuards, ParseUUIDPipe, Header, Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { UserRole } from '@ktb/shared-types';

import { GovernanceService } from './governance.service';
import { RaiseSafetyAlertDto } from './dto/raise-safety-alert.dto';
import { SubmitComplaintDto } from './dto/submit-complaint.dto';
import { ResolveComplaintDto } from './dto/resolve-complaint.dto';
import { SubmitAppealDto } from './dto/submit-appeal.dto';
import { ReviewAppealDto } from './dto/review-appeal.dto';
import { SetNomineeDto } from './dto/set-nominee.dto';
import { RequestClosureDto } from './dto/request-closure.dto';
import { ReviewClosureDto } from './dto/review-closure.dto';

import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Governance & Reporting')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id')
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  // ─── Safety Alerts ──────────────────────────────────────────────────────────

  @Post('safety/alerts')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Raise a confidential safety alert mid-service (FR-SAFE-01)' })
  @ApiResponse({ status: 201, description: 'Alert raised and routed to coordinator' })
  async raiseAlert(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: RaiseSafetyAlertDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.governanceService.raiseSafetyAlert(orgId, userId, dto, ip);
  }

  @Get('safety/alerts')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List safety alerts for the organization' })
  async listAlerts(@Param('id', ParseUUIDPipe) orgId: string) {
    return this.governanceService.listAlerts(orgId);
  }

  @Patch('safety/alerts/:alertId/acknowledge')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Coordinator acknowledges a safety alert' })
  async acknowledgeAlert(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.governanceService.acknowledgeAlert(orgId, alertId, userId);
  }

  @Patch('safety/alerts/:alertId/pause')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Pause the service associated with a safety alert (BR-10)' })
  async pauseService(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.governanceService.pauseService(orgId, alertId, userId);
  }

  @Patch('safety/alerts/:alertId/resolve')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Coordinator resolves a safety alert (D#74)' })
  async resolveAlert(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body('resolutionNotes') resolutionNotes: string,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.governanceService.resolveAlert(orgId, alertId, userId, resolutionNotes, ip);
  }

  // ─── Complaints ─────────────────────────────────────────────────────────────

  @Post('complaints')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Submit a confidential complaint (FR-SAFE-03, D#75, D#76)' })
  @ApiResponse({ status: 201, description: 'Complaint submitted and auto-routed' })
  async submitComplaint(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: SubmitComplaintDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.governanceService.submitComplaint(orgId, userId, dto, ip);
  }

  @Get('complaints')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List complaints for the organization (Admin only)' })
  async listComplaints(@Param('id', ParseUUIDPipe) orgId: string) {
    return this.governanceService.listComplaints(orgId);
  }

  @Patch('complaints/:complaintId/resolve')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resolve or dismiss a complaint' })
  async resolveComplaint(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() dto: ResolveComplaintDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.governanceService.resolveComplaint(orgId, complaintId, userId, dto, ip);
  }

  // ─── Appeals ────────────────────────────────────────────────────────────────

  @Post('appeals')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Submit an appeal against a suspension or ban (FR-SAFE-04, D#77)' })
  @ApiResponse({ status: 201, description: 'Appeal submitted for Super Admin review' })
  async submitAppeal(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: SubmitAppealDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.governanceService.submitAppeal(orgId, userId, dto, ip);
  }

  @Get('appeals')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List appeals for the organization' })
  async listAppeals(@Param('id', ParseUUIDPipe) orgId: string) {
    return this.governanceService.listAppeals(orgId);
  }

  @Patch('appeals/:appealId/review')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin reviews an appeal — uphold or dismiss (D#78, BR-11)' })
  async reviewAppeal(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('appealId', ParseUUIDPipe) appealId: string,
    @Body() dto: ReviewAppealDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.governanceService.reviewAppeal(orgId, appealId, userId, dto, ip);
  }

  // ─── Account Closures ───────────────────────────────────────────────────────

  @Post('members/:userId/closure')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Request death or duplicate account closure (FR-IDENT-07/08)' })
  @ApiResponse({ status: 201, description: 'Closure request submitted for Admin review' })
  async requestClosure(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: RequestClosureDto,
    @CurrentUserId() requesterId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.governanceService.requestClosure(orgId, targetUserId, requesterId, dto, ip);
  }

  @Get('closures')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List pending account closures for the organization' })
  async listClosures(@Param('id', ParseUUIDPipe) orgId: string) {
    return this.governanceService.listClosures(orgId);
  }

  @Patch('closures/:closureId/review')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Municipality Admin approves or rejects a closure request' })
  async reviewClosure(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @Body() dto: ReviewClosureDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.governanceService.reviewClosure(orgId, closureId, userId, dto, ip);
  }

  // ─── Reports ────────────────────────────────────────────────────────────────

  @Get('reports/dashboard')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Organization dashboard metrics for Municipality Admin (FR-REPORT-01)' })
  async getOrgDashboard(@Param('id', ParseUUIDPipe) orgId: string) {
    return this.governanceService.getOrgDashboard(orgId);
  }

  @Get('reports/volunteer-hours.csv')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="volunteer-hours.csv"')
  @ApiOperation({ summary: 'Export volunteer service hours as CSV (FR-REPORT-01)' })
  async exportVolunteerHoursCsv(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Res() res: Response,
  ) {
    const csv = await this.governanceService.exportVolunteerHoursCsv(orgId);
    res.send(csv);
  }
}

// ─── Global report endpoint (Super Admin, no org scope) ──────────────────────

@ApiTags('Governance & Reporting')
@ApiBearerAuth('JWT-auth')
@Controller('reports')
export class GlobalReportsController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('global-dashboard')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cross-org aggregate metrics for Super Admin (FR-REPORT-01, D#49)' })
  async getGlobalDashboard(@CurrentUserId() _userId: string) {
    return this.governanceService.getGlobalDashboard();
  }
}

// ─── Nominee endpoints (user-scoped, no org) ─────────────────────────────────

@ApiTags('Governance & Reporting')
@ApiBearerAuth('JWT-auth')
@Controller('me')
export class NomineeController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('nominee')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get my death-transfer nominee (FR-IDENT-06, D#44)' })
  async getMyNominee(@CurrentUserId() userId: string) {
    return this.governanceService.getMyNominee(userId);
  }

  @Post('nominee')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Set or update my death-transfer nominee (FR-IDENT-06, D#45)' })
  @ApiResponse({ status: 201, description: 'Nominee saved (requires OTP confirmation in production)' })
  async setNominee(
    @Body() dto: SetNomineeDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.governanceService.setNominee(userId, dto, ip);
  }
}
