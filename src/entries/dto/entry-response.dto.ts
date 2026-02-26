import { MetadataSchema } from '../../common/dto/metadata-schema';
import { FileResponseDto } from '../../files/dto';

/**
 * Response DTO for entries with files included.
 *
 * This is returned by GET /entries/:id and GET /entries endpoints
 * when files are fetched along with entries.
 */
export interface EntryResponseDto {
  id: string;
  planId: string;
  taskKey: string;
  title: string | null;
  notes: string | null;
  sortOrder: number;
  completionStatus: string | null;
  metadata: Record<string, unknown>;
  metadataSchema: MetadataSchema | null;
  files: FileResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}
