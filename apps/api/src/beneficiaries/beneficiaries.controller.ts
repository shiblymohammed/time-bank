import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from '@ktb/shared-types';

import { BeneficiariesService } from './beneficiaries.service';
import { GrantBeneficiaryEligibilityDto } from './dto/grant-beneficiary-eligibility.dto';
import { CreateCaregiverAuthorizationDto } from './dto/create-caregiver-authorization.dto';
import { ReviewCaregiverAuthorizationDto } from './dto/review-caregiver-authorization.dto';

import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Beneficiary Eligibility & Caregivers')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  @Post('beneficiaries/eligibility')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Grant or renew beneficiary eligibility (D#24, D#25)' })
  @ApiResponse({ status: 200, description: 'Beneficiary eligibility saved' })
  async grantEligibility(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: GrantBeneficiaryEligibilityDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.beneficiariesService.grantEligibility(organizationId, dto, userId, ip);
  }

  @Get('beneficiaries/:membershipId/eligibility')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Get beneficiary eligibility and review status' })
  @ApiResponse({ status: 200, description: 'Eligibility retrieved' })
  async getEligibility(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.beneficiariesService.getEligibility(organizationId, membershipId);
  }

  @Get('caregivers/mine')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'List the authenticated caregiver’s approved care recipients' })
  async listMyCareRecipients(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Req() req: Request,
  ) {
    const membership = (req as any).organizationMembership;
    return this.beneficiariesService.listCareRecipientsForCaregiver(
      organizationId,
      membership.membershipId,
    );
  }

  @Post('caregivers/authorize')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Create caregiver authorization request (D#8, D#37)' })
  @ApiResponse({ status: 201, description: 'Caregiver authorization created' })
  async createCaregiverAuthorization(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateCaregiverAuthorizationDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.beneficiariesService.createCaregiverAuthorization(organizationId, dto, userId, ip);
  }

  @Patch('caregivers/:authorizationId/review')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or revoke caregiver authorization' })
  @ApiResponse({ status: 200, description: 'Caregiver authorization updated' })
  async reviewCaregiverAuthorization(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('authorizationId', ParseUUIDPipe) authorizationId: string,
    @Body() dto: ReviewCaregiverAuthorizationDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.beneficiariesService.reviewCaregiverAuthorization(
      organizationId,
      authorizationId,
      dto,
      userId,
      ip,
    );
  }

  @Get('beneficiaries/:membershipId/caregivers')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'List authorized caregivers for beneficiary' })
  @ApiResponse({ status: 200, description: 'Caregivers retrieved' })
  async listCaregivers(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.beneficiariesService.listCaregiversForBeneficiary(organizationId, membershipId);
  }
}
