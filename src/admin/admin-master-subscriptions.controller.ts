import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiClsService } from '../lib/api-cls.service';
import { CreateMasterSubscriptionDto } from '../master-subscriptions/dto/create-master-subscription.dto';
import { UpdateMasterSubscriptionDto } from '../master-subscriptions/dto/update-master-subscription.dto';
import { MasterSubscriptionsService } from '../master-subscriptions/master-subscriptions.service';
import { SystemAdminGuard } from './system-admin.guard';

/**
 * System-admin endpoints for managing master subscriptions. Mounted at
 * `/admin/master-subscriptions/...`. Companion `AdminMasterSubscriptionMembersController`
 * handles `/admin/master-subscription-members/...` since member removal
 * uses a different base path.
 */
@Controller('admin/master-subscriptions')
@UseGuards(SystemAdminGuard)
export class AdminMasterSubscriptionsController {
  constructor(
    private readonly service: MasterSubscriptionsService,
    private readonly cls: ApiClsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMasterSubscriptionDto) {
    const actorUserId = this.cls.requireUserId();
    return this.service.create(dto, actorUserId);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMasterSubscriptionDto,
  ) {
    const actorUserId = this.cls.requireUserId();
    return this.service.update(id, dto, actorUserId);
  }

  @Get(':id/members')
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listMembers(id);
  }

  @Post(':id/invites')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { email?: string },
  ) {
    if (!body?.email) {
      throw new BadRequestException('email is required');
    }
    const actorUserId = this.cls.requireUserId();
    return this.service.inviteMember(id, body.email, actorUserId);
  }
}
