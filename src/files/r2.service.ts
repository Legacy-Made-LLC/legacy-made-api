import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiConfigService } from 'src/config/api-config.service';

export interface MultipartUploadPart {
  partNumber: number;
  uploadUrl: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

@Injectable()
export class R2Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ApiConfigService) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: this.config.get('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.get('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.get('R2_SECRET_ACCESS_KEY'),
      },
    });
    this.bucket = this.config.get('R2_BUCKET_NAME');
  }

  /**
   * Generate a presigned URL for direct file upload.
   * The client uploads directly to R2 using this URL.
   */
  async createPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Generate a presigned URL for file download.
   */
  async createPresignedDownloadUrl(
    key: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Initiate a multipart upload for large files.
   * Returns an upload ID that must be used for all subsequent part uploads.
   */
  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const response = await this.client.send(command);
    if (!response.UploadId) {
      throw new Error('Failed to initiate multipart upload');
    }

    return response.UploadId;
  }

  /**
   * Generate presigned URLs for uploading individual parts of a multipart upload.
   */
  async getPartUploadUrls(
    key: string,
    uploadId: string,
    numParts: number,
    expiresIn = 3600,
  ): Promise<MultipartUploadPart[]> {
    const parts: MultipartUploadPart[] = [];

    for (let partNumber = 1; partNumber <= numParts; partNumber++) {
      const command = new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });

      const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });
      parts.push({ partNumber, uploadUrl });
    }

    return parts;
  }

  /**
   * Complete a multipart upload after all parts have been uploaded.
   */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    });

    await this.client.send(command);
  }

  /**
   * Abort a multipart upload (cleanup on failure).
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
    });

    await this.client.send(command);
  }

  /**
   * Delete an object from R2.
   */
  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }
}
