import { z } from 'zod';

// =============================================================================
// JSONB Notification Schemas
// =============================================================================

export const RemindersSchema = z.object({
  enabled: z.boolean().default(true), // reminders are opt-out
  frequency: z.enum(['weekly', 'biweekly', 'monthly']).default('weekly'),
  time_of_day: z
    .enum(['morning', 'afternoon', 'evening', 'custom'])
    .default('evening'),
  custom_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { message: 'Must be HH:MM format' })
    .refine(
      (v) => {
        const [h, m] = v.split(':').map(Number);
        return h >= 0 && h <= 23 && m >= 0 && m <= 59;
      },
      { message: 'Hours must be 0-23, minutes 0-59' },
    )
    .nullable()
    .default(null), // "HH:MM" 24h
  enabled_at: z.string().nullable().default(null), // ISO 8601 timestamp
});

export const NotificationsSchema = z.object({
  reminders: RemindersSchema.default(RemindersSchema.parse({})),
});

export type Notifications = z.infer<typeof NotificationsSchema>;
export type Reminders = z.infer<typeof RemindersSchema>;

// =============================================================================
// Time-of-day presets → minutes since midnight
// =============================================================================

export const TIME_OF_DAY_MINUTES: Record<string, number> = {
  morning: 8 * 60, // 08:00
  afternoon: 12 * 60, // 12:00
  evening: 18 * 60, // 18:00
};

// =============================================================================
// Frequency → interval in days
// =============================================================================

export const FREQUENCY_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};
