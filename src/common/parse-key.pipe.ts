import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

/**
 * Validates string route parameters used as record keys.
 * Enforces: non-empty, max 255 chars, alphanumeric + underscores + hyphens.
 */
@Injectable()
export class ParseKeyPipe implements PipeTransform<string, string> {
  private static readonly KEY_PATTERN = /^[a-zA-Z0-9._-]+$/;
  private static readonly MAX_LENGTH = 255;

  transform(value: string, metadata: ArgumentMetadata): string {
    if (!value || value.length === 0) {
      throw new BadRequestException(
        `${metadata.data ?? 'key'} must not be empty`,
      );
    }

    if (value.length > ParseKeyPipe.MAX_LENGTH) {
      throw new BadRequestException(
        `${metadata.data ?? 'key'} must not exceed ${ParseKeyPipe.MAX_LENGTH} characters`,
      );
    }

    if (!ParseKeyPipe.KEY_PATTERN.test(value)) {
      throw new BadRequestException(
        `${metadata.data ?? 'key'} must contain only alphanumeric characters, hyphens, underscores, and periods`,
      );
    }

    return value;
  }
}
