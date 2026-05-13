import {
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiClsService } from '../lib/api-cls.service';
import { MasterSubscriptionsService } from '../master-subscriptions/master-subscriptions.service';
import { SystemAdminGuard } from './system-admin.guard';

/**
 * System-admin endpoints for individual master subscription members.
 * Mounted at `/admin/master-subscription-members/...`. Currently the only
 * action is removal — listing per master sub lives on
 * `AdminMasterSubscriptionsController.listMembers` for path coherence.
 */
@Controller('admin/master-subscription-members')
@UseGuards(SystemAdminGuard)
export class AdminMasterSubscriptionMembersController {
  constructor(
    private readonly service: MasterSubscriptionsService,
    private readonly cls: ApiClsService,
  ) {}

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    const actorUserId = this.cls.requireUserId();
    return this.service.removeMember(id, actorUserId);
  }
}
