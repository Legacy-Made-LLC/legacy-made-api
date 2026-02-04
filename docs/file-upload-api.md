# File Upload API Specification

API endpoints for uploading, managing, and sharing files attached to entries.

**Base URL:** `/api` (or your configured prefix)
**Authentication:** All endpoints require Bearer token (Clerk JWT) unless marked as Public.

---

## Upload Flow

### Standard Files (Documents, Images, Audio)

```
1. POST /entries/:entryId/files/upload/init  →  Get presigned URL
2. PUT {uploadUrl}                            →  Upload directly to R2
3. POST /files/:fileId/complete               →  Mark upload complete
```

### Video Files

```
1. POST /entries/:entryId/files/video/init   →  Get Mux upload URL
2. PUT {uploadUrl}                            →  Upload directly to Mux
3. (Webhook handles completion automatically)
```

### Large Files (>100MB) - Multipart Upload

```
1. POST /entries/:entryId/files/upload/init  →  Get uploadId + part URLs
2. PUT {parts[0].uploadUrl}                   →  Upload part 1, save ETag
3. PUT {parts[1].uploadUrl}                   →  Upload part 2, save ETag
4. ...
5. POST /files/:fileId/complete              →  Complete with ETags
```

---

## Endpoints

### 1. Initiate File Upload

Initiates an upload to Cloudflare R2 for documents, images, or audio files.

**Request:**
```http
POST /entries/:entryId/files/upload/init
Content-Type: application/json
Authorization: Bearer <token>

{
  "filename": "document.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| filename | string | Yes | Original filename |
| mimeType | string | Yes | MIME type (e.g., `image/jpeg`, `application/pdf`) |
| sizeBytes | number | Yes | File size in bytes (max: 1GB = 1073741824) |

**Response (Single Upload - files ≤100MB):**
```json
{
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "https://bucket.r2.cloudflarestorage.com/...",
  "uploadMethod": "PUT",
  "expiresAt": "2024-01-27T13:00:00.000Z"
}
```

**Response (Multipart Upload - files >100MB):**
```json
{
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadMethod": "PUT",
  "expiresAt": "2024-01-27T13:00:00.000Z",
  "uploadId": "multipart-upload-id",
  "parts": [
    { "partNumber": 1, "uploadUrl": "https://..." },
    { "partNumber": 2, "uploadUrl": "https://..." }
  ]
}
```

**Client Upload (Single):**
```javascript
const response = await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': mimeType },
  body: file
});
```

**Client Upload (Multipart):**
```javascript
const PART_SIZE = 100 * 1024 * 1024; // 100MB
const completedParts = [];

for (const part of parts) {
  const start = (part.partNumber - 1) * PART_SIZE;
  const end = Math.min(start + PART_SIZE, file.size);
  const chunk = file.slice(start, end);

  const response = await fetch(part.uploadUrl, {
    method: 'PUT',
    body: chunk
  });

  completedParts.push({
    partNumber: part.partNumber,
    etag: response.headers.get('ETag')
  });
}
```

---

### 2. Initiate Video Upload

Initiates a video upload to Mux for transcoding and streaming.

**Request:**
```http
POST /entries/:entryId/files/video/init
Content-Type: application/json
Authorization: Bearer <token>

{
  "filename": "family-video.mp4",
  "mimeType": "video/mp4",
  "sizeBytes": 524288000
}
```

**Response:**
```json
{
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "https://storage.googleapis.com/video-storage-us-east1-upload/..."
}
```

**Client Upload:**
```javascript
// Mux supports chunked uploads via their UpChunk library
import * as UpChunk from '@mux/upchunk';

const upload = UpChunk.createUpload({
  endpoint: uploadUrl,
  file: file,
  chunkSize: 5120 // 5MB chunks
});

upload.on('success', () => {
  // Video will be processed by Mux
  // Poll GET /files/:id until uploadStatus === 'complete'
});
```

---

### 3. Complete Upload

Marks an upload as complete. Required for R2 uploads; optional for Mux (handled by webhook).

**Request (Single Upload):**
```http
POST /files/:id/complete
Content-Type: application/json
Authorization: Bearer <token>

{}
```

**Request (Multipart Upload):**
```http
POST /files/:id/complete
Content-Type: application/json
Authorization: Bearer <token>

{
  "parts": [
    { "partNumber": 1, "etag": "\"abc123...\"" },
    { "partNumber": 2, "etag": "\"def456...\"" }
  ]
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "entryId": "660e8400-e29b-41d4-a716-446655440000",
  "filename": "document.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "storageType": "r2",
  "uploadStatus": "complete",
  "accessLevel": "private",
  "createdAt": "2024-01-27T12:00:00.000Z",
  "updatedAt": "2024-01-27T12:00:00.000Z"
}
```

---

### 4. List Files for Entry

Returns all files attached to an entry.

**Request:**
```http
GET /entries/:entryId/files
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "entryId": "660e8400-e29b-41d4-a716-446655440000",
    "filename": "document.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1048576,
    "storageType": "r2",
    "uploadStatus": "complete",
    "accessLevel": "private",
    "createdAt": "2024-01-27T12:00:00.000Z",
    "updatedAt": "2024-01-27T12:00:00.000Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "entryId": "660e8400-e29b-41d4-a716-446655440000",
    "filename": "family-video.mp4",
    "mimeType": "video/mp4",
    "sizeBytes": 524288000,
    "storageType": "mux",
    "uploadStatus": "complete",
    "muxPlaybackId": "abcd1234",
    "accessLevel": "private",
    "createdAt": "2024-01-27T12:00:00.000Z",
    "updatedAt": "2024-01-27T12:05:00.000Z"
  }
]
```

---

### 5. Get File Metadata

Returns metadata for a single file.

**Request:**
```http
GET /files/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "entryId": "660e8400-e29b-41d4-a716-446655440000",
  "filename": "document.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "storageType": "r2",
  "storageKey": "entries/660e.../1706356800000-abc123.pdf",
  "uploadStatus": "complete",
  "muxPlaybackId": null,
  "muxAssetId": null,
  "accessLevel": "private",
  "shareToken": null,
  "shareExpiresAt": null,
  "createdAt": "2024-01-27T12:00:00.000Z",
  "updatedAt": "2024-01-27T12:00:00.000Z"
}
```

**Upload Status Values:**
| Status | Description |
|--------|-------------|
| `pending` | File record created, upload not started |
| `uploading` | Multipart upload in progress |
| `complete` | Upload finished successfully |
| `failed` | Upload or processing failed |

---

### 6. Get Download/Playback URL

Returns a time-limited URL for downloading or streaming the file.

**Request:**
```http
GET /files/:id/download
Authorization: Bearer <token>
```

**Response (R2 File):**
```json
{
  "downloadUrl": "https://bucket.r2.cloudflarestorage.com/...?X-Amz-Signature=...",
  "expiresIn": 3600
}
```

**Response (Mux Video):**
```json
{
  "playbackUrl": "https://stream.mux.com/abcd1234.m3u8?token=...",
  "playbackId": "abcd1234",
  "tokens": {
    "playbackToken": "eyJ...",
    "thumbnailToken": "eyJ...",
    "storyboardToken": "eyJ..."
  },
  "expiresIn": 604800
}
```

**Using Mux Player:**
```html
<mux-player
  playback-id="abcd1234"
  playback-token="eyJ..."
  thumbnail-token="eyJ..."
  storyboard-token="eyJ..."
></mux-player>
```

**Thumbnail URL:**
```
https://image.mux.com/{playbackId}/thumbnail.jpg?token={thumbnailToken}
```

---

### 7. Create Shareable Link

Creates a public, time-limited link to share the file.

**Request:**
```http
POST /files/:id/share
Content-Type: application/json
Authorization: Bearer <token>

{
  "expiresInHours": 24
}
```

**Parameters:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| expiresInHours | number | No | 24 | Hours until link expires (1-168) |

**Response:**
```json
{
  "shareUrl": "/files/share/abc123token...",
  "shareToken": "abc123token...",
  "expiresAt": "2024-01-28T12:00:00.000Z"
}
```

---

### 8. Revoke Shareable Link

Revokes an existing shareable link, making the file private again.

**Request:**
```http
DELETE /files/:id/share
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "accessLevel": "private",
  "shareToken": null,
  "shareExpiresAt": null,
  ...
}
```

---

### 9. Delete File

Deletes a file from the database and storage (R2/Mux).

**Request:**
```http
DELETE /files/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "deleted": true
}
```

---

### 10. Access Shared File (Public)

Access a file via its share token. No authentication required.

**Request:**
```http
GET /files/share/:token
```

**Response (R2 File):**
```json
{
  "downloadUrl": "https://bucket.r2.cloudflarestorage.com/...?X-Amz-Signature=...",
  "expiresIn": 3600
}
```

**Response (Mux Video):**
```json
{
  "playbackUrl": "https://stream.mux.com/abcd1234.m3u8?token=...",
  "playbackId": "abcd1234",
  "tokens": {
    "playbackToken": "eyJ...",
    "thumbnailToken": "eyJ...",
    "storyboardToken": "eyJ..."
  },
  "expiresIn": 604800
}
```

**Errors:**
- `404 Not Found` - Token invalid or expired

---

## Entry Responses with Files

When fetching entries via `GET /entries/:id` or `GET /plans/:planId/entries`, files are automatically included with presigned download URLs.

### Entry Response Schema

```typescript
interface EntryResponse {
  id: string;
  planId: string;
  taskKey: string;
  title: string | null;
  notes: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
  files: FileResponse[];
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
}

interface FileResponse {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageType: 'r2' | 'mux';
  uploadStatus: string;
  downloadUrl: string | null;     // Presigned R2 URL (1 hour expiry)
  thumbnailUrl: string | null;    // Mux thumbnail URL (videos only)
  playbackId: string | null;      // Mux playback ID (videos only)
  tokens: {                       // Mux tokens (videos only)
    playbackToken: string;
    thumbnailToken: string;
    storyboardToken: string;
  } | null;
}
```

### Get Single Entry

**Request:**
```http
GET /entries/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440000",
  "planId": "770e8400-e29b-41d4-a716-446655440000",
  "taskKey": "insurance",
  "title": "Home Insurance Documents",
  "notes": "Policy documents for 123 Main St",
  "sortOrder": 0,
  "metadata": {},
  "files": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "policy.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 1048576,
      "storageType": "r2",
      "uploadStatus": "complete",
      "downloadUrl": "https://bucket.r2.cloudflarestorage.com/...?X-Amz-Signature=...",
      "thumbnailUrl": null,
      "playbackId": null,
      "tokens": null
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "filename": "walkthrough.mp4",
      "mimeType": "video/mp4",
      "sizeBytes": 524288000,
      "storageType": "mux",
      "uploadStatus": "complete",
      "downloadUrl": null,
      "thumbnailUrl": "https://image.mux.com/abcd1234/thumbnail.jpg?token=eyJ...",
      "playbackId": "abcd1234",
      "tokens": {
        "playbackToken": "eyJ...",
        "thumbnailToken": "eyJ...",
        "storyboardToken": "eyJ..."
      }
    }
  ],
  "createdAt": "2024-01-27T12:00:00.000Z",
  "updatedAt": "2024-01-27T12:00:00.000Z"
}
```

### List Entries for Plan

**Request:**
```http
GET /plans/:planId/entries
GET /plans/:planId/entries?taskKey=insurance
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "planId": "770e8400-e29b-41d4-a716-446655440000",
    "taskKey": "insurance",
    "title": "Home Insurance Documents",
    "notes": "Policy documents",
    "sortOrder": 0,
    "metadata": {},
    "files": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "filename": "policy.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": 1048576,
        "storageType": "r2",
        "uploadStatus": "complete",
        "downloadUrl": "https://bucket.r2.cloudflarestorage.com/...",
        "thumbnailUrl": null,
        "playbackId": null,
        "tokens": null
      }
    ],
    "createdAt": "2024-01-27T12:00:00.000Z",
    "updatedAt": "2024-01-27T12:00:00.000Z"
  }
]
```

### Notes

- **URL Expiry**: Presigned R2 `downloadUrl` values expire in 1 hour. Mux tokens expire in 7 days.
- **Pending Uploads**: Files with `uploadStatus !== 'complete'` will have `downloadUrl: null`.
- **Batch Optimization**: When listing entries, files are fetched in a single batch query for performance.

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

**Common Errors:**

| Status | Error | Description |
|--------|-------|-------------|
| 400 | File storage is not configured | R2 not configured on server |
| 400 | Video service is not configured | Mux not configured on server |
| 400 | File upload is not complete | Tried to download incomplete file |
| 400 | Video is not ready for playback | Mux still processing video |
| 401 | Unauthorized | Missing or invalid auth token |
| 404 | File not found | File doesn't exist or not owned by user |
| 404 | Share link not found or expired | Invalid/expired share token |

---

## File Object Schema

```typescript
interface File {
  id: string;                    // UUID
  entryId: string;               // UUID - parent entry
  filename: string;              // Original filename
  mimeType: string;              // MIME type
  sizeBytes: number;             // File size in bytes
  storageType: 'r2' | 'mux';     // Storage backend
  storageKey: string;            // Internal storage identifier
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'failed';
  muxPlaybackId: string | null;  // Mux playback ID (videos only)
  muxAssetId: string | null;     // Mux asset ID (videos only)
  accessLevel: 'private' | 'shareable';
  shareToken: string | null;     // Token for shared access
  shareExpiresAt: string | null; // ISO timestamp
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}
```

---

## Recommended Libraries

**Web:**
- [@mux/mux-player](https://www.npmjs.com/package/@mux/mux-player) - Video player
- [@mux/upchunk](https://www.npmjs.com/package/@mux/upchunk) - Resumable video uploads

**React Native:**
- [react-native-mux-player](https://github.com/nicksrandall/react-native-mux-player) - Mobile video player
- Standard `fetch` for R2 uploads

---

## Example: Complete Upload Flow (React)

```typescript
async function uploadFile(entryId: string, file: File, token: string) {
  const isVideo = file.type.startsWith('video/');

  // 1. Initiate upload
  const initEndpoint = isVideo
    ? `/entries/${entryId}/files/video/init`
    : `/entries/${entryId}/files/upload/init`;

  const initResponse = await fetch(initEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size
    })
  });

  const { fileId, uploadUrl, parts } = await initResponse.json();

  // 2. Upload to storage
  if (parts) {
    // Multipart upload
    const completedParts = await uploadMultipart(file, parts);
    await completeUpload(fileId, completedParts, token);
  } else if (isVideo) {
    // Mux upload (use UpChunk for progress)
    await uploadToMux(uploadUrl, file);
    // Poll for completion or wait for webhook
  } else {
    // Single R2 upload
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });
    await completeUpload(fileId, null, token);
  }

  return fileId;
}

async function completeUpload(fileId: string, parts: any[] | null, token: string) {
  await fetch(`/files/${fileId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ parts: parts || undefined })
  });
}
```
