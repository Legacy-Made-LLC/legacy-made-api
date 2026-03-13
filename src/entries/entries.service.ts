import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MetadataSchema } from '../common/dto/metadata-schema';
import { groupBy } from '../common/utils/array';
import { mergeMetadata } from '../common/utils/helpers';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { EntitlementsService } from '../entitlements';
import { FilesService } from '../files/files.service';
import { ApiClsService } from '../lib/api-cls.service';
import { entries, Entry } from '../schema';
import {
  CreateEntryDto,
  EntryResponseDto,
  FindEntriesQueryDto,
  UpdateEntryDto,
} from './dto';

export interface EntriesListResponse {
  data: EntryResponseDto[];
  quota: {
    limit: number;
    current: number;
    remaining: number | null;
    unlimited: boolean;
  };
}

@Injectable()
export class EntriesService {
  constructor(
    private readonly db: DbService,
    private readonly entitlementsService: EntitlementsService,
    private readonly filesService: FilesService,
    private readonly cls: ApiClsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Create a new entry.
   * RLS policy ensures user can only create entries in their own plans.
   */
  async create(planId: string, createEntryDto: CreateEntryDto) {
    return this.db.rls(async (tx) => {
      const [entry] = await tx
        .insert(entries)
        .values({
          ...createEntryDto,
          planId,
          modifiedBy: this.cls.get('userId'),
        })
        .returning();
      await this.activityLog.log(tx, {
        planId,
        action: 'created',
        resourceType: 'entry',
        resourceId: entry.id,
      });
      return entry;
    });
  }

  /**
   * Find entries for a plan, optionally filtered by query parameters.
   * Includes files with presigned URLs for each entry.
   * RLS policy ensures only entries from user's plans are returned.
   * Returns entries with quota usage metadata.
   */
  async findAll(
    planId: string,
    query?: FindEntriesQueryDto,
  ): Promise<EntriesListResponse> {
    // First, get the entries and quota
    const { entryList, quota } = await this.db.rls(async (tx) => {
      const conditions = [eq(entries.planId, planId)];

      if (query?.taskKey) {
        conditions.push(eq(entries.taskKey, query.taskKey));
      }

      const [data, quotaStatus] = await Promise.all([
        tx
          .select()
          .from(entries)
          .where(and(...conditions))
          .orderBy(entries.sortOrder),
        this.entitlementsService.getQuotaStatusInTx(tx, 'entries'),
      ]);

      return { entryList: data, quota: quotaStatus };
    });

    if (entryList.length === 0) {
      return { data: [], quota };
    }

    // Batch fetch files for all entries
    const entryIds = entryList.map((e) => e.id);
    const allFiles = await this.filesService.findByEntryIds(entryIds);
    const filesByEntry = groupBy(allFiles, 'entryId');

    // Build responses with files
    const data = await Promise.all(
      entryList.map(async (entry) => {
        const entryFiles = filesByEntry[entry.id] || [];
        const filesWithUrls =
          await this.filesService.toFileResponses(entryFiles);
        return this.toEntryResponse(entry, filesWithUrls);
      }),
    );

    return { data, quota };
  }

  /**
   * Find a single entry by ID with files included.
   * RLS policy ensures only entries from user's plans are visible.
   */
  async findOne(id: string): Promise<EntryResponseDto> {
    const entry = await this.db.rls(async (tx) => {
      return this.findOneInTx(tx, id);
    });

    // Fetch files for this entry
    const fileList = await this.filesService.findAllForEntry(id);
    const filesWithUrls = await this.filesService.toFileResponses(fileList);

    return this.toEntryResponse(entry, filesWithUrls);
  }

  /**
   * Internal: Find entry within an existing transaction.
   */
  private async findOneInTx(tx: DrizzleTransaction, id: string) {
    const [entry] = await tx.select().from(entries).where(eq(entries.id, id));

    if (!entry) {
      throw new NotFoundException(`Entry with id ${id} not found`);
    }

    return entry;
  }

  /**
   * Update an entry.
   * RLS policy ensures user can only update entries in their own plans.
   */
  async update(id: string, updateEntryDto: UpdateEntryDto) {
    return this.db.rls(async (tx) => {
      const existing = await this.findOneInTx(tx, id);

      const updatedMetadata = mergeMetadata(
        existing.metadata,
        updateEntryDto.metadata,
      );

      const [updated] = await tx
        .update(entries)
        .set({
          ...updateEntryDto,
          metadata: updatedMetadata,
          modifiedBy: this.cls.get('userId'),
        })
        .where(eq(entries.id, id))
        .returning();

      await this.activityLog.log(tx, {
        planId: existing.planId,
        action: 'updated',
        resourceType: 'entry',
        resourceId: id,
      });

      return updated;
    });
  }

  /**
   * Delete an entry.
   * RLS policy ensures user can only delete entries in their own plans.
   */
  async remove(id: string) {
    return this.db.rls(async (tx) => {
      const existing = await this.findOneInTx(tx, id);
      await tx.delete(entries).where(eq(entries.id, id));
      await this.activityLog.log(tx, {
        planId: existing.planId,
        action: 'deleted',
        resourceType: 'entry',
        resourceId: id,
      });
      return { deleted: true };
    });
  }

  /**
   * Convert entry to response DTO with files.
   */
  private toEntryResponse(
    entry: Entry,
    files: Awaited<ReturnType<FilesService['toFileResponses']>>,
  ): EntryResponseDto {
    return {
      id: entry.id,
      planId: entry.planId,
      taskKey: entry.taskKey,
      title: entry.title,
      notes: entry.notes,
      sortOrder: entry.sortOrder,
      completionStatus: entry.completionStatus,
      metadata: entry.metadata as Record<string, unknown>,
      metadataSchema: entry.metadataSchema as MetadataSchema | null,
      files,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }
}
