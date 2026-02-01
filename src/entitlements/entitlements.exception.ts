import { ForbiddenException } from '@nestjs/common';
import { EntitlementResult } from './entitlements.types';

export class EntitlementException extends ForbiddenException {
  constructor(result: EntitlementResult) {
    super({
      message: result.message,
      code:
        result.reason === 'feature_locked'
          ? 'FEATURE_LOCKED'
          : 'QUOTA_EXCEEDED',
      details: result.details,
    });
  }
}
