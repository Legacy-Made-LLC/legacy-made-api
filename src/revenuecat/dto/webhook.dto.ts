import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// RevenueCat event types we observe. The schema accepts any string so
// future RC-added types don't 400 — they fall through the handler's
// default branch and land as 'skipped' in the dedupe log.
// See https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
export const KNOWN_RC_EVENT_TYPES = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'SUBSCRIPTION_PAUSED',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIBER_ALIAS',
  'TRANSFER',
  'REFUND_REVERSED',
  'TEST',
] as const;

export type RcEventType = (typeof KNOWN_RC_EVENT_TYPES)[number];

export const rcWebhookEventSchema = z.object({
  type: z.string(),
  id: z.string(),
  app_user_id: z.string(),
  original_app_user_id: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  original_transaction_id: z.string().nullish(),
  transaction_id: z.string().nullish(),
  product_id: z.string().nullish(),
  new_product_id: z.string().nullish(),
  entitlement_ids: z.array(z.string()).nullish(),
  entitlement_id: z.string().nullish(),
  purchased_at_ms: z.number().nullish(),
  expiration_at_ms: z.number().nullish(),
  grace_period_expiration_at_ms: z.number().nullish(),
  store: z.string().nullish(),
  cancel_reason: z.string().nullish(),
  expiration_reason: z.string().nullish(),
  is_trial_conversion: z.boolean().optional(),
});

export type RcWebhookEvent = z.infer<typeof rcWebhookEventSchema>;

export const revenuecatWebhookSchema = z.object({
  api_version: z.string().optional(),
  event: rcWebhookEventSchema,
});

export class RevenuecatWebhookDto extends createZodDto(
  revenuecatWebhookSchema,
) {}
