import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  EntitlementsGuard,
  RequiresPillar,
  RequiresQuota,
  RequiresViewPillar,
} from '../entitlements';
import {
  PlanAccessGuard,
  RequiresAccessLevel,
} from '../plan-access/plan-access.guard';
import {
  CreateMessageDto,
  FindMessagesQueryDto,
  UpdateMessageDto,
} from './dto';
import { MessagesService } from './messages.service';

@Controller('plans/:planId/messages')
@UseGuards(PlanAccessGuard, EntitlementsGuard)
@RequiresViewPillar('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * Create a new message in a plan.
   * POST /plans/:planId/messages
   *
   * Requires: messages pillar access + legacy_messages quota (owners)
   * Requires: full_edit access level (trusted contacts)
   */
  @Post()
  @RequiresPillar('messages')
  @RequiresQuota('legacy_messages')
  @RequiresAccessLevel('full_edit')
  create(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    return this.messagesService.create(planId, createMessageDto);
  }

  /**
   * Get all messages for a plan, optionally filtered by taskKey.
   * GET /plans/:planId/messages
   * GET /plans/:planId/messages?taskKey=messages.people
   *
   * Requires: messages pillar view access (class-level)
   */
  @Get()
  findAll(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query() query: FindMessagesQueryDto,
  ) {
    return this.messagesService.findAll(planId, query);
  }

  /**
   * Get a single message by ID.
   * GET /:id
   *
   * Requires: messages pillar view access (class-level)
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.messagesService.findOne(id);
  }

  /**
   * Update a message.
   * PATCH /messages/:id
   *
   * Requires: messages pillar access (owners)
   * Requires: full_edit access level (trusted contacts)
   */
  @Patch(':id')
  @RequiresPillar('messages')
  @RequiresAccessLevel('full_edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMessageDto: UpdateMessageDto,
  ) {
    return this.messagesService.update(id, updateMessageDto);
  }

  /**
   * Delete a message.
   * DELETE /messages/:id
   *
   * Requires: messages pillar access (owners)
   * Requires: full_edit access level (trusted contacts)
   */
  @Delete(':id')
  @RequiresPillar('messages')
  @RequiresAccessLevel('full_edit')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.messagesService.remove(id);
  }
}
