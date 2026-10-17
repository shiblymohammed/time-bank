import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole, GlobalRestrictionStatus } from '@ktb/shared-types';

import { AdminService } from './admin.service';
import { ImposeRestrictionDto } from './dto/impose-restriction.dto';
import { ResolveRestrictionDto } from './dto/resolve-restriction.dto';
import { UpdateOrgStatusDto } from './dto/update-org-status.dto';
import { GrantOrgRoleDto } from './dto/grant-org-role.dto';
import { RevokeOrgRoleDto } from './dto/revoke-org-role.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Central Super Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Central dashboard overview metrics',
    description:
      'Aggregates platform-wide metrics including total global users, organizations, universal wallet balance, and pending memberships.',
  })
  @ApiResponse({ status: 200, description: 'Overview metrics retrieved' })
  async getOverview() {
    return this.adminService.getOverviewMetrics();
  }

  @Post('restrictions')
  @ApiOperation({
    summary: 'Impose platform-wide account restriction',
    description:
      'Imposes a global suspension, permanent ban, or fraud hold on a user account (D#82, D#83).',
  })
  @ApiResponse({ status: 201, description: 'Restriction imposed' })
  @ApiResponse({ status: 400, description: 'Cannot restrict self or invalid parameters' })
  @ApiResponse({ status: 404, description: 'Target user not found' })
  async imposeRestriction(
    @Body() dto: ImposeRestrictionDto,
    @CurrentUserId() adminId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.adminService.imposeRestriction(dto, adminId, ip);
  }

  @Post('restrictions/:id/resolve')
  @ApiOperation({
    summary: 'Resolve an active platform-wide account restriction',
    description:
      'Resolves an existing restriction. If user has no remaining active restrictions, restores account to ACTIVE status.',
  })
  @ApiResponse({ status: 200, description: 'Restriction resolved' })
  @ApiResponse({ status: 404, description: 'Restriction not found' })
  async resolveRestriction(
    @Param('id', ParseUUIDPipe) restrictionId: string,
    @Body() dto: ResolveRestrictionDto,
    @CurrentUserId() adminId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.adminService.resolveRestriction(restrictionId, dto, adminId, ip);
  }

  @Get('restrictions')
  @ApiOperation({
    summary: 'List global account restrictions',
    description: 'Lists platform restrictions with optional filtering by user ID or status.',
  })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: GlobalRestrictionStatus })
  @ApiResponse({ status: 200, description: 'Restrictions retrieved' })
  async listRestrictions(
    @Query('userId') userId?: string,
    @Query('status') status?: GlobalRestrictionStatus,
  ) {
    return this.adminService.listRestrictions(userId, status);
  }

  @Patch('organizations/:id/status')
  @ApiOperation({
    summary: 'Update organization lifecycle status',
    description: 'Transitions organization between DRAFT, ACTIVE, SUSPENDED, and ARCHIVED.',
  })
  @ApiResponse({ status: 200, description: 'Organization status updated' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async updateOrgStatus(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: UpdateOrgStatusDto,
    @CurrentUserId() adminId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.adminService.updateOrganizationStatus(orgId, dto, adminId, ip);
  }

  @Post('organizations/:id/roles')
  @ApiOperation({
    summary: 'Grant / appoint organization-scoped administrative role',
    description:
      'Assigns MUNICIPALITY_ADMIN, COORDINATOR, or other roles to a user within the target organization.',
  })
  @ApiResponse({ status: 201, description: 'Role granted' })
  @ApiResponse({ status: 404, description: 'Organization or user not found' })
  @ApiResponse({ status: 409, description: 'User already holds this role' })
  async grantOrgRole(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: GrantOrgRoleDto,
    @CurrentUserId() adminId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.adminService.grantOrganizationRole(orgId, dto, adminId, ip);
  }

  @Delete('organizations/:id/roles/:roleGrantId')
  @ApiOperation({
    summary: 'Revoke organization-scoped role grant',
    description: 'Revokes an active administrative or operational role from a user in an organization.',
  })
  @ApiResponse({ status: 200, description: 'Role revoked' })
  @ApiResponse({ status: 404, description: 'Role grant not found' })
  async revokeOrgRole(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('roleGrantId', ParseUUIDPipe) roleGrantId: string,
    @Body() dto: RevokeOrgRoleDto,
    @CurrentUserId() adminId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.adminService.revokeOrganizationRole(orgId, roleGrantId, dto, adminId, ip);
  }

  @Get('audit-logs')
  @ApiOperation({
    summary: 'Query and filter global audit trail',
    description:
      'Searches append-only audit events by event type, actor ID, organization ID, target entity, or date range.',
  })
  @ApiResponse({ status: 200, description: 'Audit events returned' })
  async queryAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.adminService.queryAuditLogs(query);
  }
}
