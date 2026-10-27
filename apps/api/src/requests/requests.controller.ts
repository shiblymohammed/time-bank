import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';

import { RequestsService } from './requests.service';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { CancelServiceRequestDto } from './dto/cancel-service-request.dto';
import { RescheduleServiceRequestDto } from './dto/reschedule-service-request.dto';
import { RequestQueryDto } from './dto/request-query.dto';

import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';

@ApiTags('Service Requests')
@ApiBearerAuth('JWT-auth')
@Controller('organizations/:id/requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({
    summary: 'Create service request with mandatory manual location (D#8, D#59, D#60, D#61)',
  })
  @ApiResponse({ status: 201, description: 'Request created and candidate matching initiated' })
  async createRequest(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateServiceRequestDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? req.socket.remoteAddress;
    const idempotencyHeader = req.headers?.['x-idempotency-key'];
    if (typeof idempotencyHeader === 'string' && !dto.idempotencyKey) {
      dto.idempotencyKey = idempotencyHeader;
    }
    return this.requestsService.createRequest(organizationId, userId, dto, ip);
  }

  @Get()
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'List organization requests with pagination and status filters' })
  @ApiResponse({ status: 200, description: 'Requests retrieved' })
  async listRequests(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Query() query: RequestQueryDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const membershipContext = (req as any).organizationMembership;
    return this.requestsService.listRequests(organizationId, userId, membershipContext, query);
  }

  @Get(':requestId')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Get service request details and assignment status' })
  @ApiResponse({ status: 200, description: 'Request retrieved' })
  async getRequest(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const membershipContext = (req as any).organizationMembership;
    return this.requestsService.getRequestById(
      organizationId,
      requestId,
      userId,
      membershipContext,
    );
  }

  @Post(':requestId/cancel')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Cancel service request (D#29, D#62)' })
  @ApiResponse({ status: 200, description: 'Request cancelled' })
  async cancelRequest(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CancelServiceRequestDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const membershipContext = (req as any).organizationMembership;
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.requestsService.cancelRequest(
      organizationId,
      requestId,
      userId,
      membershipContext,
      dto,
      ip,
    );
  }

  @Post(':requestId/reschedule')
  @UseGuards(AuthGuard, OrganizationAccessGuard)
  @ApiOperation({ summary: 'Reschedule service request (D#62)' })
  @ApiResponse({ status: 200, description: 'Request rescheduled' })
  async rescheduleRequest(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RescheduleServiceRequestDto,
    @CurrentUserId() userId: string,
    @Req() req: Request,
  ) {
    const membershipContext = (req as any).organizationMembership;
    const ip = req.ip ?? req.socket.remoteAddress;
    return this.requestsService.rescheduleRequest(
      organizationId,
      requestId,
      userId,
      membershipContext,
      dto,
      ip,
    );
  }
}
