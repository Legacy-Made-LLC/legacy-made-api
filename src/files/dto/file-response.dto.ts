/**
 * DTO for file responses with presigned URLs.
 *
 * This is used when files are included in entry responses.
 * URLs are pre-generated so the client can immediately access files.
 */
export interface FileResponseDto {
  id: string;
  parentFileId: string | null;
  role: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageType: 'r2' | 'mux';
  uploadStatus: string;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  playbackId: string | null;
  tokens: {
    playbackToken: string;
    thumbnailToken: string;
    storyboardToken: string;
  } | null;
}
