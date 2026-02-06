import { FileResponseDto } from '../../files/dto';
import { MetadataSchema } from '../../common/dto/metadata-schema';

/**
 * Response DTO for wishes with files included.
 *
 * This is returned by GET /wishes/:id and GET /wishes endpoints
 * when files are fetched along with wishes.
 */
export interface WishResponseDto {
  id: string;
  planId: string;
  taskKey: string;
  title: string | null;
  notes: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
  metadataSchema: MetadataSchema | null;
  files: FileResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}
