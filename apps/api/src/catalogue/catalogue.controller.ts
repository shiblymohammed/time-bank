import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from '@ktb/shared-types';

import { CatalogueService } from './catalogue.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateGlobalServiceDefinitionDto } from './dto/create-global-service.dto';
import { UpdateGlobalServiceDefinitionDto } from './dto/update-global-service.dto';
import { ConfigureOrgCatalogueDto } from './dto/configure-org-catalogue.dto';
import { CreateOrgProposalDto } from './dto/create-proposal.dto';
import { ReviewOrgProposalDto } from './dto/review-proposal.dto';

import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Service Catalogue & Proposals')
@ApiBearerAuth('JWT-auth')
@Controller()
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  // ─── Central Categories & Master Definitions (Super Admin Only) ───────────
  @Post('catalogue/categories')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create service category (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Category created' })
  @ApiResponse({ status: 403, description: 'Forbidden for non-Super Admins' })
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.catalogueService.createCategory(dto, userId, ip);
  }

  @Patch('catalogue/categories/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update service category status or details (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.catalogueService.updateCategory(id, dto, userId, ip);
  }

  @Get('catalogue/categories')
  @ApiOperation({ summary: 'List all service categories' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Categories retrieved' })
  async listCategories(@Query('activeOnly') activeOnly?: string) {
    return this.catalogueService.listCategories(activeOnly === 'true');
  }

  @Post('catalogue/global')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create canonical global service definition (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Global service created' })
  @ApiResponse({ status: 403, description: 'Forbidden for local organization admins' })
  async createGlobalService(
    @Body() dto: CreateGlobalServiceDefinitionDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.catalogueService.createGlobalService(dto, userId, ip);
  }

  @Patch('catalogue/global/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update global service definition status/rules (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Global service updated' })
  async updateGlobalService(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGlobalServiceDefinitionDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.catalogueService.updateGlobalService(id, dto, userId, ip);
  }

  @Get('catalogue/global')
  @ApiOperation({ summary: 'List global service definitions' })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Services retrieved' })
  async listGlobalServices(
    @Query('categoryId') categoryId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const isActiveOnly = activeOnly !== 'false';
    return this.catalogueService.listGlobalServices(categoryId, isActiveOnly);
  }

  @Get('catalogue/global/:id')
  @ApiOperation({ summary: 'Get global service definition by ID' })
  @ApiResponse({ status: 200, description: 'Service retrieved' })
  async getGlobalService(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogueService.getGlobalService(id);
  }

  @Get('catalogue/proposals')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all municipal proposals nationwide (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Proposals retrieved' })
  async listAllProposals() {
    return this.catalogueService.listProposals();
  }

  @Patch('catalogue/proposals/:proposalId/review')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Centrally review and approve/reject proposal (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Proposal reviewed and conditionally activated' })
  @ApiResponse({ status: 400, description: 'Invalid proposal state transition' })
  @ApiResponse({ status: 403, description: 'Forbidden for non-Super Admins' })
  async reviewProposal(
    @Param('proposalId', ParseUUIDPipe) proposalId: string,
    @Body() dto: ReviewOrgProposalDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.catalogueService.reviewProposal(proposalId, dto, userId, ip);
  }

  // ─── Organization Tenant Service Catalogue (Local Enablement & Proposals) ──
  @Get('organizations/:id/catalogue')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'List enabled services for organization' })
  @ApiResponse({ status: 200, description: 'Catalogue retrieved' })
  @ApiResponse({ status: 403, description: 'Cross-tenant access denied' })
  async listOrgCatalogue(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Query('all') all?: string,
  ) {
    const enabledOnly = all !== 'true';
    return this.catalogueService.listOrgCatalogue(organizationId, enabledOnly);
  }

  @Get('organizations/:id/catalogue/:catalogId')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Get single organization catalogue item' })
  @ApiResponse({ status: 200, description: 'Catalogue item retrieved' })
  async getOrgCatalogueItem(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('catalogId', ParseUUIDPipe) catalogId: string,
  ) {
    return this.catalogueService.getOrgCatalogueItem(organizationId, catalogId);
  }

  @Post('organizations/:id/catalogue/configure')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Enable or update catalogue item for organization (D#10)' })
  @ApiResponse({ status: 200, description: 'Catalogue item configured' })
  @ApiResponse({ status: 403, description: 'Cross-tenant mutation denied' })
  async configureOrgCatalogue(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: ConfigureOrgCatalogueDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.catalogueService.configureOrgCatalogue(organizationId, dto, userId, ip);
  }

  @Post('organizations/:id/catalogue/proposals')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Submit local service proposal to central Super Admin' })
  @ApiResponse({ status: 201, description: 'Proposal submitted' })
  @ApiResponse({ status: 409, description: 'Duplicate pending proposal' })
  async createOrgProposal(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateOrgProposalDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.catalogueService.createProposal(organizationId, dto, userId, ip);
  }

  @Get('organizations/:id/catalogue/proposals')
  @UseGuards(AuthGuard, OrganizationAccessGuard, RolesGuard)
  @Roles(UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List organization proposals' })
  @ApiResponse({ status: 200, description: 'Proposals retrieved' })
  async listOrgProposals(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.catalogueService.listProposals(organizationId);
  }
}
