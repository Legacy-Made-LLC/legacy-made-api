import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Validates share token format and length.
 *
 * Share tokens are generated using randomBytes(32).toString('base64url')
 * which produces a 43-character base64url string. We allow up to 64
 * characters to be safe while preventing memory-consuming attacks.
 */
@Injectable()
export class ShareTokenPipe implements PipeTransform {
  private static readonly MAX_LENGTH = 64;
  // Base64url alphabet: A-Z, a-z, 0-9, -, _
  private static readonly BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

  transform(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('Invalid share token');
    }

    if (value.length === 0) {
      throw new BadRequestException('Share token is required');
    }

    if (value.length > ShareTokenPipe.MAX_LENGTH) {
      throw new BadRequestException('Invalid share token');
    }

    if (!ShareTokenPipe.BASE64URL_REGEX.test(value)) {
      throw new BadRequestException('Invalid share token');
    }

    return value;
  }
}
