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
import { CreateWishDto, FindWishesQueryDto, UpdateWishDto } from './dto';
import { WishesService } from './wishes.service';

@Controller('plans/:planId/wishes')
@UseGuards(EntitlementsGuard)
@RequiresViewPillar('wishes')
export class WishesController {
  constructor(private readonly wishesService: WishesService) {}

  /**
   * Create a new wish in a plan.
   * POST /plans/:planId/wishes
   *
   * Requires: wishes pillar access + wishes quota
   */
  @Post()
  @RequiresPillar('wishes')
  @RequiresQuota('wishes')
  create(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() createWishDto: CreateWishDto,
  ) {
    return this.wishesService.create(planId, createWishDto);
  }

  /**
   * Get all wishes for a plan, optionally filtered by taskKey.
   * GET /plans/:planId/wishes
   * GET /plans/:planId/wishes?taskKey=some_task
   *
   * Requires: wishes pillar view access (class-level)
   */
  @Get()
  findAll(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query() query: FindWishesQueryDto,
  ) {
    return this.wishesService.findAll(planId, query);
  }

  /**
   * Get a single wish by ID.
   * GET /:id
   *
   * Requires: wishes pillar view access (class-level)
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.wishesService.findOne(id);
  }

  /**
   * Update a wish.
   * PATCH /wishes/:id
   *
   * Requires: wishes pillar access
   */
  @Patch(':id')
  @RequiresPillar('wishes')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateWishDto: UpdateWishDto,
  ) {
    return this.wishesService.update(id, updateWishDto);
  }

  /**
   * Delete a wish.
   * DELETE /wishes/:id
   *
   * Requires: wishes pillar access
   */
  @Delete(':id')
  @RequiresPillar('wishes')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.wishesService.remove(id);
  }
}
