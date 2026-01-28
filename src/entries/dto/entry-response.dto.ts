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
  metadata: Record<string, unknown>;
  files: FileResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}
