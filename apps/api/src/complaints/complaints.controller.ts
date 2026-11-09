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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ktb/shared-types';
import { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { Roles } from '../authorization/decorators/roles.decorator';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { ComplaintsService } from './complaints.service';
import { ComplaintNoteDto, DecideComplaintDto, RaiseComplaintDto } from './dto/complaint.dto';

const ipOf = (req: Request) => req.ip ?? req.socket.remoteAddress;
const contextOf = (req: Request) => (req as any).organizationMembership;

@ApiTags('Complaints')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, OrganizationAccessGuard)
@Controller('organizations/:id/complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post()
  @ApiOperation({
    summary: 'A member makes a confidential complaint',
    description:
      'The subject decides who handles it: a coordinator, the Municipality Admin or a Super Admin.',
  })
  @ApiResponse({ status: 201, description: 'Complaint received' })
  @ApiResponse({ status: 404, description: 'The linked visit is not one of this member' })
  @ApiResponse({ status: 429, description: 'Too many complaints today' })
  raise(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Body() dto: RaiseComplaintDto,
    @Req() req: Request,
  ) {
    return this.complaints.raise(orgId, contextOf(req), dto, ipOf(req));
  }

  @Get('mine')
  @ApiOperation({ summary: "A member's own complaints, with the outcome once decided" })
  mine(@Param('id', ParseUUIDPipe) orgId: string, @Req() req: Request) {
    return this.complaints.listMine(orgId, contextOf(req).userId);
  }

  @Get()
  @ApiOperation({
    summary: 'Complaints at the levels this member of staff handles',
    description: 'A summary only. Reading one uses the detail route.',
  })
  @ApiQuery({ name: 'open', required: false, description: 'false includes closed complaints' })
  list(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Query('open') open: string | undefined,
    @Req() req: Request,
  ) {
    return this.complaints.listForStaff(orgId, contextOf(req), open !== 'false');
  }

  @Get(':complaintId')
  @ApiOperation({ summary: 'One complaint with its full history' })
  detail(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Req() req: Request,
  ) {
    return this.complaints.detail(orgId, complaintId, contextOf(req), ipOf(req));
  }

  @Post(':complaintId/take')
  @ApiOperation({ summary: 'Staff mark a complaint as being handled' })
  take(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Req() req: Request,
  ) {
    return this.complaints.take(orgId, complaintId, contextOf(req), ipOf(req));
  }

  @Post(':complaintId/notes')
  @ApiOperation({ summary: 'Staff add to the case history' })
  addNote(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() dto: ComplaintNoteDto,
    @Req() req: Request,
  ) {
    return this.complaints.addNote(orgId, complaintId, contextOf(req), dto.notes, ipOf(req));
  }

  @Post(':complaintId/pass-up')
  @ApiOperation({ summary: 'Staff pass a complaint to the next level, with a reason' })
  passUp(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() dto: ComplaintNoteDto,
    @Req() req: Request,
  ) {
    return this.complaints.passUp(orgId, complaintId, contextOf(req), dto.notes, ipOf(req));
  }

  @Post(':complaintId/decide')
  @ApiOperation({ summary: 'Staff close a complaint and tell the member the outcome' })
  decide(
    @Param('id', ParseUUIDPipe) orgId: string,
    @Param('complaintId', ParseUUIDPipe) complaintId: string,
    @Body() dto: DecideComplaintDto,
    @Req() req: Request,
  ) {
    return this.complaints.decide(orgId, complaintId, contextOf(req), dto, ipOf(req));
  }
}

@ApiTags('Complaints')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/complaints')
export class CentralComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @ApiOperation({ summary: 'Complaints across every community, as a summary' })
  @ApiQuery({ name: 'open', required: false, description: 'false includes closed complaints' })
  list(@Query('open') open: string | undefined, @CurrentUserId() userId: string) {
    return this.complaints.listEverywhere(userId, open !== 'false');
  }
}
