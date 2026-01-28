import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { entries, Entry } from '../schema';
import { FilesService } from '../files/files.service';
import {
  CreateEntryDto,
  FindEntriesQueryDto,
  UpdateEntryDto,
  EntryResponseDto,
} from './dto';

@Injectable()
export class EntriesService {
  constructor(
    private readonly db: DbService,
    private readonly filesService: FilesService,
  ) {}

  /**
   * Create a new entry.
   * RLS policy ensures user can only create entries in their own plans.
   */
  async create(planId: string, createEntryDto: CreateEntryDto) {
    return this.db.rls(async (tx) => {
      const [entry] = await tx
        .insert(entries)
        .values({ ...createEntryDto, planId })
        .returning();
      return entry;
    });
  }

  /**
   * Find entries for a plan, optionally filtered by query parameters.
   * Includes files with presigned URLs for each entry.
   * RLS policy ensures only entries from user's plans are returned.
   */
  async findAll(
    planId: string,
    query?: FindEntriesQueryDto,
  ): Promise<EntryResponseDto[]> {
    // First, get the entries
    const entryList = await this.db.rls(async (tx) => {
      const conditions = [eq(entries.planId, planId)];

      if (query?.taskKey) {
        conditions.push(eq(entries.taskKey, query.taskKey));
      }

      return tx
        .select()
        .from(entries)
        .where(and(...conditions));
    });

    if (entryList.length === 0) {
      return [];
    }

    // Batch fetch files for all entries
    const entryIds = entryList.map((e) => e.id);
    const allFiles = await this.filesService.findByEntryIds(entryIds);
    const filesByEntry = this.groupBy(allFiles, 'entryId');

    // Build responses with files
    return Promise.all(
      entryList.map(async (entry) => {
        const entryFiles = filesByEntry[entry.id] || [];
        const filesWithUrls =
          await this.filesService.toFileResponses(entryFiles);
        return this.toEntryResponse(entry, filesWithUrls);
      }),
    );
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

      // Merge metadata if provided
      const updatedMetadata = updateEntryDto.metadata
        ? { ...(existing.metadata as object), ...updateEntryDto.metadata }
        : existing.metadata;

      const [updated] = await tx
        .update(entries)
        .set({
          ...updateEntryDto,
          metadata: updatedMetadata,
          updatedAt: new Date(),
        })
        .where(eq(entries.id, id))
        .returning();

      return updated;
    });
  }

  /**
   * Delete an entry.
   * RLS policy ensures user can only delete entries in their own plans.
   */
  async remove(id: string) {
    return this.db.rls(async (tx) => {
      await this.findOneInTx(tx, id);
      await tx.delete(entries).where(eq(entries.id, id));
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
      metadata: entry.metadata as Record<string, unknown>,
      files,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  /**
   * Group array items by a key.
   */
  private groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
    return arr.reduce(
      (acc, item) => {
        const k = String(item[key]);
        (acc[k] = acc[k] || []).push(item);
        return acc;
      },
      {} as Record<string, T[]>,
    );
  }
}
