import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { MetadataSchema } from '../common/dto/metadata-schema';
import { groupBy } from '../common/utils/array';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { EntitlementsService } from '../entitlements';
import { FilesService } from '../files/files.service';
import { wishes, Wish } from '../schema';
import {
  CreateWishDto,
  FindWishesQueryDto,
  UpdateWishDto,
  WishResponseDto,
} from './dto';

export interface WishesListResponse {
  data: WishResponseDto[];
  quota: {
    limit: number;
    current: number;
    remaining: number | null;
    unlimited: boolean;
  };
}

@Injectable()
export class WishesService {
  constructor(
    private readonly db: DbService,
    private readonly entitlementsService: EntitlementsService,
    private readonly filesService: FilesService,
  ) {}

  /**
   * Create a new wish.
   * RLS policy ensures user can only create wishes in their own plans.
   */
  async create(planId: string, createWishDto: CreateWishDto) {
    return this.db.rls(async (tx) => {
      const [wish] = await tx
        .insert(wishes)
        .values({ ...createWishDto, planId })
        .returning();
      return wish;
    });
  }

  /**
   * Find wishes for a plan, optionally filtered by query parameters.
   * Includes files with presigned URLs for each wish.
   * RLS policy ensures only wishes from user's plans are returned.
   * Returns wishes with quota usage metadata.
   */
  async findAll(
    planId: string,
    query?: FindWishesQueryDto,
  ): Promise<WishesListResponse> {
    // First, get the wishes and quota
    const { wishList, quota } = await this.db.rls(async (tx) => {
      const conditions = [eq(wishes.planId, planId)];

      if (query?.taskKey) {
        conditions.push(eq(wishes.taskKey, query.taskKey));
      }

      const [data, quotaStatus] = await Promise.all([
        tx
          .select()
          .from(wishes)
          .where(and(...conditions))
          .orderBy(wishes.sortOrder),
        this.entitlementsService.getQuotaStatusInTx(tx, 'wishes'),
      ]);

      return { wishList: data, quota: quotaStatus };
    });

    if (wishList.length === 0) {
      return { data: [], quota };
    }

    // Batch fetch files for all wishes
    const wishIds = wishList.map((w) => w.id);
    const allFiles = await this.filesService.findByWishIds(wishIds);
    const filesByWish = groupBy(allFiles, 'wishId');

    // Build responses with files
    const data = await Promise.all(
      wishList.map(async (wish) => {
        const wishFiles = filesByWish[wish.id] || [];
        const filesWithUrls =
          await this.filesService.toFileResponses(wishFiles);
        return this.toWishResponse(wish, filesWithUrls);
      }),
    );

    return { data, quota };
  }

  /**
   * Find a single wish by ID with files included.
   * RLS policy ensures only wishes from user's plans are visible.
   */
  async findOne(id: string): Promise<WishResponseDto> {
    const wish = await this.db.rls(async (tx) => {
      return this.findOneInTx(tx, id);
    });

    // Fetch files for this wish
    const fileList = await this.filesService.findAllForWish(id);
    const filesWithUrls = await this.filesService.toFileResponses(fileList);

    return this.toWishResponse(wish, filesWithUrls);
  }

  /**
   * Internal: Find wish within an existing transaction.
   */
  private async findOneInTx(tx: DrizzleTransaction, id: string) {
    const [wish] = await tx.select().from(wishes).where(eq(wishes.id, id));

    if (!wish) {
      throw new NotFoundException(`Wish with id ${id} not found`);
    }

    return wish;
  }

  /**
   * Update a wish.
   * RLS policy ensures user can only update wishes in their own plans.
   */
  async update(id: string, updateWishDto: UpdateWishDto) {
    return this.db.rls(async (tx) => {
      const existing = await this.findOneInTx(tx, id);

      // Merge metadata if provided (existing.metadata is always an object due to DB default)
      const existingMetadata =
        existing.metadata && typeof existing.metadata === 'object'
          ? (existing.metadata as Record<string, unknown>)
          : {};
      const updatedMetadata = updateWishDto.metadata
        ? { ...existingMetadata, ...updateWishDto.metadata }
        : existing.metadata;

      const [updated] = await tx
        .update(wishes)
        .set({
          ...updateWishDto,
          metadata: updatedMetadata,
        })
        .where(eq(wishes.id, id))
        .returning();

      return updated;
    });
  }

  /**
   * Delete a wish.
   * RLS policy ensures user can only delete wishes in their own plans.
   */
  async remove(id: string) {
    return this.db.rls(async (tx) => {
      await this.findOneInTx(tx, id);
      await tx.delete(wishes).where(eq(wishes.id, id));
      return { deleted: true };
    });
  }

  /**
   * Convert wish to response DTO with files.
   */
  private toWishResponse(
    wish: Wish,
    files: Awaited<ReturnType<FilesService['toFileResponses']>>,
  ): WishResponseDto {
    return {
      id: wish.id,
      planId: wish.planId,
      taskKey: wish.taskKey,
      title: wish.title,
      notes: wish.notes,
      sortOrder: wish.sortOrder,
      metadata: wish.metadata as Record<string, unknown>,
      metadataSchema: wish.metadataSchema as MetadataSchema | null,
      files,
      createdAt: wish.createdAt,
      updatedAt: wish.updatedAt,
    };
  }
}
