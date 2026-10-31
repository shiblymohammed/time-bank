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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from '@ktb/shared-types';

import { MembershipsService } from './memberships.service';
import { ApplyMembershipDto } from './dto/apply-membership.dto';
import { ApproveMembershipDto } from './dto/approve-membership.dto';
import { RejectMembershipDto } from './dto/reject-membership.dto';
import { UploadMembershipDocDto } from './dto/upload-membership-doc.dto';
import { ReviewMembershipDocDto } from './dto/review-membership-doc.dto';
import { GrantRoleDto } from './dto/grant-role.dto';
import { RevokeRoleDto } from './dto/revoke-role.dto';
import { MembershipQueryDto } from './dto/membership-query.dto';

import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Organization Memberships & Roles')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id/memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post('apply')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Apply to join an organization',
    description:
      'A global verified user applies to join a branded Time Bank municipality/corporation (ITB-005, ITB-007).',
  })
  @ApiResponse({ status: 201, description: 'Application submitted' })
  @ApiResponse({ status: 400, description: 'Organization not accepting applications' })
  @ApiResponse({ status: 409, description: 'Already an approved member' })
  async apply(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: ApplyMembershipDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.membershipsService.apply(organizationId, userId, dto, ip);
  }

  @Get()
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List organization memberships',
    description:
      'Returns paginated list of memberships for the organization with optional status filtering.',
  })
  @ApiResponse({ status: 200, description: 'Memberships retrieved' })
  async listMemberships(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Query() query: MembershipQueryDto,
  ) {
    return this.membershipsService.listMemberships(organizationId, query);
  }

  @Get(':membershipId')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get membership application details',
    description:
      'Retrieves full details of a specific membership record including roles and approvals.',
  })
  @ApiResponse({ status: 200, description: 'Membership retrieved' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  async getMembership(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.membershipsService.getMembershipById(organizationId, membershipId);
  }

  @Post(':membershipId/approve')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Approve membership application',
    description:
      'Approves application, assigns sequential membership number, and grants initial operational role.',
  })
  @ApiResponse({ status: 200, description: 'Application approved' })
  @ApiResponse({ status: 400, description: 'Already approved' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  async approveMembership(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: ApproveMembershipDto,
    @CurrentUserId() approverId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.membershipsService.approveMembership(
      organizationId,
      membershipId,
      approverId,
      dto,
      ip,
    );
  }

  @Post(':membershipId/reject')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Reject membership application',
    description: 'Rejects application with mandatory administrative reason notes.',
  })
  @ApiResponse({ status: 200, description: 'Application rejected' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  async rejectMembership(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: RejectMembershipDto,
    @CurrentUserId() rejecterId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.membershipsService.rejectMembership(
      organizationId,
      membershipId,
      rejecterId,
      dto,
      ip,
    );
  }

  @Get(':membershipId/documents')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List supporting documents for an organization membership' })
  async listDocuments(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.membershipsService.listMembershipDocuments(organizationId, membershipId);
  }

  @Post(':membershipId/documents')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: 'Upload supporting proof document for membership',
    description: 'Applicant submits supporting local residence proof or identity document.',
  })
  @ApiResponse({ status: 201, description: 'Document record created' })
  @ApiResponse({ status: 403, description: 'Can only upload for own application' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  async uploadDocument(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UploadMembershipDocDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.membershipsService.uploadDocument(organizationId, membershipId, userId, dto, ip);
  }

  @Patch('documents/:documentId/review')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Review membership document',
    description: 'Coordinator or Admin approves or rejects submitted supporting document.',
  })
  @ApiResponse({ status: 200, description: 'Document review status updated' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async reviewDocument(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ReviewMembershipDocDto,
    @CurrentUserId() reviewerId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.membershipsService.reviewDocument(organizationId, documentId, reviewerId, dto, ip);
  }

  @Post(':membershipId/roles')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Grant additional role to approved member',
    description: 'Municipality Admin grants role (e.g. COORDINATOR, CAREGIVER, MERCHANT).',
  })
  @ApiResponse({ status: 201, description: 'Role granted' })
  @ApiResponse({ status: 409, description: 'Role already granted' })
  async grantRole(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: GrantRoleDto,
    @CurrentUserId() granterId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.membershipsService.grantRole(organizationId, membershipId, dto, granterId, ip);
  }

  @Delete(':membershipId/roles/:roleGrantId')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Revoke role from member',
    description: 'Revokes an active operational role grant from a member in this organization.',
  })
  @ApiResponse({ status: 200, description: 'Role revoked' })
  @ApiResponse({ status: 404, description: 'Role grant not found' })
  async revokeRole(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Param('roleGrantId', ParseUUIDPipe) roleGrantId: string,
    @Body() dto: RevokeRoleDto,
    @CurrentUserId() revokerId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.membershipsService.revokeRole(
      organizationId,
      membershipId,
      roleGrantId,
      dto,
      revokerId,
      ip,
    );
  }
}
