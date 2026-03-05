import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MetadataSchema } from '../common/dto/metadata-schema';
import { groupBy } from '../common/utils/array';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { EntitlementsService } from '../entitlements';
import { FilesService } from '../files/files.service';
import { ApiClsService } from '../lib/api-cls.service';
import { messages, Message } from '../schema';
import {
  CreateMessageDto,
  FindMessagesQueryDto,
  UpdateMessageDto,
  MessageResponseDto,
} from './dto';

export interface MessagesListResponse {
  data: MessageResponseDto[];
  quota: {
    limit: number;
    current: number;
    remaining: number | null;
    unlimited: boolean;
  };
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly db: DbService,
    private readonly entitlementsService: EntitlementsService,
    private readonly filesService: FilesService,
    private readonly cls: ApiClsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Create a new message.
   * RLS policy ensures user can only create messages in their own plans.
   */
  async create(planId: string, createMessageDto: CreateMessageDto) {
    return this.db.rls(async (tx) => {
      const [message] = await tx
        .insert(messages)
        .values({
          ...createMessageDto,
          planId,
          modifiedBy: this.cls.get('userId'),
        })
        .returning();
      await this.activityLog.log(tx, {
        planId,
        action: 'created',
        resourceType: 'message',
        resourceId: message.id,
      });
      return message;
    });
  }

  /**
   * Find messages for a plan, optionally filtered by query parameters.
   * Includes files with presigned URLs for each message.
   * RLS policy ensures only messages from user's plans are returned.
   * Returns messages with quota usage metadata.
   */
  async findAll(
    planId: string,
    query?: FindMessagesQueryDto,
  ): Promise<MessagesListResponse> {
    // First, get the messages and quota
    const { messageList, quota } = await this.db.rls(async (tx) => {
      const conditions = [eq(messages.planId, planId)];

      if (query?.taskKey) {
        conditions.push(eq(messages.taskKey, query.taskKey));
      }

      const [data, quotaStatus] = await Promise.all([
        tx
          .select()
          .from(messages)
          .where(and(...conditions))
          .orderBy(messages.sortOrder),
        this.entitlementsService.getQuotaStatusInTx(tx, 'legacy_messages'),
      ]);

      return { messageList: data, quota: quotaStatus };
    });

    if (messageList.length === 0) {
      return { data: [], quota };
    }

    // Batch fetch files for all messages
    const messageIds = messageList.map((m) => m.id);
    const allFiles = await this.filesService.findByMessageIds(messageIds);
    const filesByMessage = groupBy(allFiles, 'messageId');

    // Build responses with files
    const data = await Promise.all(
      messageList.map(async (message) => {
        const messageFiles = filesByMessage[message.id] || [];
        const filesWithUrls =
          await this.filesService.toFileResponses(messageFiles);
        return this.toMessageResponse(message, filesWithUrls);
      }),
    );

    return { data, quota };
  }

  /**
   * Find a single message by ID with files included.
   * RLS policy ensures only messages from user's plans are visible.
   */
  async findOne(id: string): Promise<MessageResponseDto> {
    const message = await this.db.rls(async (tx) => {
      return this.findOneInTx(tx, id);
    });

    // Fetch files for this message
    const fileList = await this.filesService.findAllForMessage(id);
    const filesWithUrls = await this.filesService.toFileResponses(fileList);

    return this.toMessageResponse(message, filesWithUrls);
  }

  /**
   * Internal: Find message within an existing transaction.
   */
  private async findOneInTx(tx: DrizzleTransaction, id: string) {
    const [message] = await tx
      .select()
      .from(messages)
      .where(eq(messages.id, id));

    if (!message) {
      throw new NotFoundException(`Message with id ${id} not found`);
    }

    return message;
  }

  /**
   * Update a message.
   * RLS policy ensures user can only update messages in their own plans.
   */
  async update(id: string, updateMessageDto: UpdateMessageDto) {
    return this.db.rls(async (tx) => {
      const existing = await this.findOneInTx(tx, id);

      // Merge metadata if provided (existing.metadata is always an object due to DB default)
      const existingMetadata =
        existing.metadata && typeof existing.metadata === 'object'
          ? (existing.metadata as Record<string, unknown>)
          : {};
      const updatedMetadata = updateMessageDto.metadata
        ? { ...existingMetadata, ...updateMessageDto.metadata }
        : existing.metadata;

      const [updated] = await tx
        .update(messages)
        .set({
          ...updateMessageDto,
          metadata: updatedMetadata,
          modifiedBy: this.cls.get('userId'),
        })
        .where(eq(messages.id, id))
        .returning();

      await this.activityLog.log(tx, {
        planId: existing.planId,
        action: 'updated',
        resourceType: 'message',
        resourceId: id,
      });

      return updated;
    });
  }

  /**
   * Delete a message.
   * RLS policy ensures user can only delete messages in their own plans.
   */
  async remove(id: string) {
    return this.db.rls(async (tx) => {
      const existing = await this.findOneInTx(tx, id);
      await tx.delete(messages).where(eq(messages.id, id));
      await this.activityLog.log(tx, {
        planId: existing.planId,
        action: 'deleted',
        resourceType: 'message',
        resourceId: id,
      });
      return { deleted: true };
    });
  }

  /**
   * Convert message to response DTO with files.
   */
  private toMessageResponse(
    message: Message,
    files: Awaited<ReturnType<FilesService['toFileResponses']>>,
  ): MessageResponseDto {
    return {
      id: message.id,
      planId: message.planId,
      taskKey: message.taskKey,
      title: message.title,
      notes: message.notes,
      sortOrder: message.sortOrder,
      completionStatus: message.completionStatus,
      metadata: message.metadata as Record<string, unknown>,
      metadataSchema: message.metadataSchema as MetadataSchema | null,
      files,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }
}
