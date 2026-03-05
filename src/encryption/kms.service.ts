import { Injectable } from '@nestjs/common';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { ApiConfigService } from '../config/api-config.service';

@Injectable()
export class KmsService {
  private readonly client: KMSClient;
  private readonly keyArn: string;

  constructor(private readonly config: ApiConfigService) {
    this.client = new KMSClient({
      region: this.config.get('AWS_KMS_REGION'),
      credentials: {
        accessKeyId: this.config.get('AWS_ACCESS_KEY_ID_KMS'),
        secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY_KMS'),
      },
    });
    this.keyArn = this.config.get('AWS_KMS_KEY_ARN');
  }

  /**
   * Encrypt a DEK plaintext using AWS KMS.
   * Returns the encrypted ciphertext as a Buffer.
   */
  async encryptDek(dekPlaintext: Buffer): Promise<Buffer> {
    const command = new EncryptCommand({
      KeyId: this.keyArn,
      Plaintext: dekPlaintext,
    });

    const response = await this.client.send(command);

    if (!response.CiphertextBlob) {
      throw new Error('KMS encryption returned no ciphertext');
    }

    return Buffer.from(response.CiphertextBlob);
  }

  /**
   * Decrypt a DEK ciphertext using AWS KMS.
   * Returns the decrypted plaintext as a Buffer.
   */
  async decryptDek(dekCiphertext: Buffer): Promise<Buffer> {
    const command = new DecryptCommand({
      KeyId: this.keyArn,
      CiphertextBlob: dekCiphertext,
    });

    const response = await this.client.send(command);

    if (!response.Plaintext) {
      throw new Error('KMS decryption returned no plaintext');
    }

    return Buffer.from(response.Plaintext);
  }
}
