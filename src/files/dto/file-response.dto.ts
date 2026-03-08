/**
 * DTO for file responses with presigned URLs.
 *
 * This is used when files are included in entry responses.
 * URLs are pre-generated so the client can immediately access files.
 */
export interface FileResponseDto {
  id: string;
  role: string;
  parentFileId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageType: 'r2';
  uploadStatus: string;
  isEncrypted: boolean;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
}
