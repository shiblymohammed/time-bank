import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from '@ktb/shared-types';

import { MatchingService } from './matching.service';
import { UpdateVolunteerAvailabilityDto } from './dto/update-volunteer-availability.dto';
import { VerifyVolunteerSkillDto } from './dto/verify-volunteer-skill.dto';
import { AcceptVolunteerOfferDto } from './dto/accept-volunteer-offer.dto';
import { DeclineVolunteerOfferDto } from './dto/decline-volunteer-offer.dto';
import { WithdrawVolunteerAssignmentDto } from './dto/withdraw-volunteer-assignment.dto';
import { CoordinatorDispatchDto } from './dto/coordinator-dispatch.dto';
import { CreateOperationalZoneDto } from './dto/create-operational-zone.dto';
import { UpdateOperationalZoneDto } from './dto/update-operational-zone.dto';
import { AssignVolunteerZoneDto } from './dto/assign-volunteer-zone.dto';

import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Volunteer Availability, Skills & Matching')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  // ─── Operational Zones (Coordinator-Managed) ───────────────────────────────
  @Post('zones')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create coordinator-managed operational zone (D#9, D#13)' })
  @ApiResponse({ status: 201, description: 'Zone created' })
  async createZone(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateOperationalZoneDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.matchingService.createZone(organizationId, dto, userId, ip);
  }

  @Get('zones')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'List operational zones for an organization' })
  @ApiResponse({ status: 200, description: 'Zones retrieved' })
  async listZones(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.matchingService.listZones(organizationId);
  }

  @Get('zones/:zoneId')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Get operational zone details' })
  @ApiResponse({ status: 200, description: 'Zone retrieved' })
  async getZone(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
  ) {
    return this.matchingService.getZone(organizationId, zoneId);
  }

  @Put('zones/:zoneId')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update operational zone' })
  @ApiResponse({ status: 200, description: 'Zone updated' })
  async updateZone(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body() dto: UpdateOperationalZoneDto,
  ) {
    return this.matchingService.updateZone(organizationId, zoneId, dto);
  }

  @Post('zones/:zoneId/volunteers')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign volunteer to operational zone' })
  @ApiResponse({ status: 201, description: 'Volunteer assigned to zone' })
  async assignVolunteerToZone(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body() dto: AssignVolunteerZoneDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.matchingService.assignVolunteerToZone(organizationId, zoneId, dto, userId, ip);
  }

  @Delete('zones/:zoneId/volunteers/:membershipId')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Remove volunteer from operational zone' })
  @ApiResponse({ status: 200, description: 'Volunteer removed from zone' })
  async removeVolunteerFromZone(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    await this.matchingService.removeVolunteerFromZone(organizationId, zoneId, membershipId, userId, ip);
    return { success: true, message: 'Volunteer removed from operational zone' };
  }

  @Get('volunteers/:membershipId/zones')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'List assigned zones for a volunteer' })
  @ApiResponse({ status: 200, description: 'Volunteer zones retrieved' })
  async listVolunteerZones(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.matchingService.listVolunteerZones(organizationId, membershipId);
  }

  // ─── Volunteer Availability & GPS ──────────────────────────────────────────
  @Put('volunteers/:membershipId/availability')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Update volunteer availability preferences and transient GPS (D#58)' })
  @ApiResponse({ status: 200, description: 'Availability updated' })
  async updateAvailability(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateVolunteerAvailabilityDto,
  ) {
    return this.matchingService.updateAvailability(organizationId, membershipId, dto);
  }

  @Get('volunteers/:membershipId/availability')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Get volunteer availability preferences' })
  @ApiResponse({ status: 200, description: 'Availability retrieved' })
  async getAvailability(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.matchingService.getAvailability(organizationId, membershipId);
  }

  // ─── Volunteer Skills ───────────────────────────────────────────────────────
  @Post('volunteers/skills/verify')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Verify or reject volunteer skill (D#11)' })
  @ApiResponse({ status: 200, description: 'Skill verified' })
  async verifySkill(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: VerifyVolunteerSkillDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.matchingService.verifySkill(organizationId, dto, userId, ip);
  }

  @Get('volunteers/:membershipId/skills')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'List skills of a volunteer' })
  @ApiResponse({ status: 200, description: 'Skills retrieved' })
  async listSkills(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.matchingService.listVolunteerSkills(organizationId, membershipId);
  }

  // ─── Assignment Offers Lifecycle ───────────────────────────────────────────
  @Post('assignments/:assignmentId/accept')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Volunteer accepts task offer (D#12, D#64)' })
  @ApiResponse({ status: 200, description: 'Offer accepted' })
  @ApiResponse({ status: 409, description: 'Positions already filled or offer expired' })
  async acceptOffer(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: AcceptVolunteerOfferDto,
    @Req() req: Request,
  ) {
    const membershipContext = (req as any).organizationMembership;
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.matchingService.acceptOffer(
      organizationId,
      assignmentId,
      membershipContext.membershipId,
      dto,
      ip,
    );
  }

  @Post('assignments/:assignmentId/decline')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Volunteer declines task offer without penalty (D#12)' })
  @ApiResponse({ status: 200, description: 'Offer declined' })
  async declineOffer(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: DeclineVolunteerOfferDto,
    @Req() req: Request,
  ) {
    const membershipContext = (req as any).organizationMembership;
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.matchingService.declineOffer(
      organizationId,
      assignmentId,
      membershipContext.membershipId,
      dto,
      ip,
    );
  }

  @Post('assignments/:assignmentId/withdraw')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Volunteer withdraws from accepted assignment (D#31, D#32)' })
  @ApiResponse({ status: 200, description: 'Assignment withdrawn' })
  async withdrawAssignment(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: WithdrawVolunteerAssignmentDto,
    @Req() req: Request,
  ) {
    const membershipContext = (req as any).organizationMembership;
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.matchingService.withdrawAssignment(
      organizationId,
      assignmentId,
      membershipContext.membershipId,
      dto,
      ip,
    );
  }

  @Post('requests/:requestId/dispatch')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Coordinator manually dispatches volunteer (D#7, D#30)' })
  @ApiResponse({ status: 200, description: 'Volunteer dispatched' })
  async coordinatorDispatch(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CoordinatorDispatchDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.matchingService.coordinatorDispatch(organizationId, requestId, dto, userId, ip);
  }

  @Post('requests/:requestId/expand-radius')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Expand matching search radius or escalate (D#7, D#13)' })
  @ApiResponse({ status: 200, description: 'Search radius expanded or escalated' })
  async expandRadius(
    @Param('id', ParseUUIDPipe) _organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.matchingService.expandSearchRadius(requestId);
  }

  @Post('requests/:requestId/progression')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Evaluate multi-round matching progression and offer expiry (D#7, D#13)' })
  @ApiResponse({ status: 200, description: 'Round progression evaluated' })
  async evaluateProgression(
    @Param('id', ParseUUIDPipe) _organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.matchingService.evaluateRoundProgression(requestId);
  }
}
