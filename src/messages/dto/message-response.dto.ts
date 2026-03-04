import { FileResponseDto } from '../../files/dto';
import { MetadataSchema } from '../../common/dto/metadata-schema';

/**
 * Response DTO for messages with files included.
 *
 * This is returned by GET /messages/:id and GET /messages endpoints
 * when files are fetched along with messages.
 */
export interface MessageResponseDto {
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
