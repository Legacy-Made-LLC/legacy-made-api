import { Injectable } from '@nestjs/common';
import {
  KMSClient,
  DecryptCommand,
  GetPublicKeyCommand,
} from '@aws-sdk/client-kms';
import { ApiConfigService } from '../config/api-config.service';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class KmsService {
  private readonly client: KMSClient;
  private readonly asymmetricKeyArn: string;

  private static readonly PUBLIC_KEY_CACHE_KEY = 'kms:escrow-public-key';
  private static readonly PUBLIC_KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly config: ApiConfigService,
    private readonly cache: CacheService,
  ) {
    this.client = new KMSClient({
      region: this.config.get('AWS_KMS_REGION'),
      credentials: {
        accessKeyId: this.config.get('AWS_ACCESS_KEY_ID_KMS'),
        secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY_KMS'),
      },
    });
    this.asymmetricKeyArn = this.config.get('AWS_KMS_ASYMMETRIC_KEY_ARN');
  }

  /**
   * Get the RSA_4096 public key for client-side encryption.
   * Returns base64-encoded SubjectPublicKeyInfo (DER) — ready for Web Crypto importKey.
   * Cached with request coalescing via CacheService (24h TTL).
   */
  async getPublicKey(): Promise<string> {
    return this.cache.getOrSet(
      KmsService.PUBLIC_KEY_CACHE_KEY,
      () => this.fetchPublicKey(),
      KmsService.PUBLIC_KEY_TTL_MS,
    );
  }

  /**
   * Decrypt a DEK ciphertext using the asymmetric RSA_4096 KMS key.
   * The ciphertext must have been encrypted with RSA-OAEP-SHA256 using the public key.
   */
  async decryptDek(dekCiphertext: Buffer): Promise<Buffer> {
    const command = new DecryptCommand({
      KeyId: this.asymmetricKeyArn,
      CiphertextBlob: dekCiphertext,
      EncryptionAlgorithm: 'RSAES_OAEP_SHA_256',
    });

    const response = await this.client.send(command);

    if (!response.Plaintext) {
      throw new Error('KMS decryption returned no plaintext');
    }

    return Buffer.from(response.Plaintext);
  }

  private async fetchPublicKey(): Promise<string> {
    const command = new GetPublicKeyCommand({
      KeyId: this.asymmetricKeyArn,
    });

    const response = await this.client.send(command);

    if (!response.PublicKey) {
      throw new Error('KMS GetPublicKey returned no key material');
    }

    return Buffer.from(response.PublicKey).toString('base64');
  }
}
