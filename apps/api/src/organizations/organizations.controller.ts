import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UserRole } from '@ktb/shared-types';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { CreateAppBuildDto } from './dto/create-app-build.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Organizations')
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  /**
   * POST /api/v1/organizations
   * Provisions a new organization (Super Admin only: D#1, D#52, ITB-010).
   */
  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Provision new municipality/corporation organization (Super Admin)' })
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  async createOrganization(@Body() dto: CreateOrganizationDto, @CurrentUserId() userId: string) {
    const org = await this.orgsService.createOrganization(dto, userId);
    return {
      success: true,
      data: org,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/organizations
   * Lists organizations. Super Admin sees all; regular users see active public summaries.
   */
  @Get()
  @ApiOperation({ summary: 'List onboarded organizations' })
  async listOrganizations() {
    const orgs = await this.orgsService.findAll(true);
    return {
      success: true,
      data: orgs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/organizations/:orgId
   * Retrieves organization details, branding, and registered app builds.
   */
  @Get(':orgId')
  @ApiOperation({ summary: 'Get organization details by ID' })
  async getOrganization(@Param('orgId', ParseUUIDPipe) orgId: string) {
    const org = await this.orgsService.findById(orgId);
    return {
      success: true,
      data: org,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * PATCH /api/v1/organizations/:orgId
   * Updates organization status or metadata (Super Admin only).
   */
  @Patch(':orgId')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update organization status or metadata (Super Admin)' })
  async updateOrganization(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUserId() userId: string,
  ) {
    const updated = await this.orgsService.updateOrganization(orgId, dto, userId);
    return {
      success: true,
      data: updated,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/organizations/:orgId/branding
   * Public tenant bootstrap endpoint returning visual branding for mobile and web apps (ITB-003).
   */
  @Get(':orgId/branding')
  @ApiOperation({ summary: 'Get public branding configuration for tenant bootstrap' })
  async getBranding(@Param('orgId', ParseUUIDPipe) orgId: string) {
    const branding = await this.orgsService.getBranding(orgId);
    return {
      success: true,
      data: branding,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * PUT /api/v1/organizations/:orgId/branding
   * Updates organization branding and increments version (Super Admin or Municipality Admin).
   */
  @Put(':orgId/branding')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.MUNICIPALITY_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update organization branding (Super Admin or Municipality Admin)' })
  async updateBranding(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: UpdateBrandingDto,
    @CurrentUserId() userId: string,
  ) {
    const branding = await this.orgsService.updateBranding(orgId, dto, userId);
    return {
      success: true,
      data: branding,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/organizations/:orgId/app-builds
   * Lists registered release builds for an organization.
   */
  @Get(':orgId/app-builds')
  @ApiOperation({ summary: 'List registered app builds for an organization' })
  async getAppBuilds(@Param('orgId', ParseUUIDPipe) orgId: string) {
    const builds = await this.orgsService.getAppBuilds(orgId);
    return {
      success: true,
      data: builds,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/organizations/:orgId/app-builds
   * Registers or updates a branded application release build (Super Admin only: ITB-011).
   */
  @Post(':orgId/app-builds')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register or update branded mobile app build (Super Admin)' })
  async registerAppBuild(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateAppBuildDto,
    @CurrentUserId() userId: string,
  ) {
    const build = await this.orgsService.createOrUpdateAppBuild(orgId, dto, userId);
    return {
      success: true,
      data: build,
      timestamp: new Date().toISOString(),
    };
  }
}
