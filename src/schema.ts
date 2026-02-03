/**
 * Legacy Made - Database Schema
 *
 * Drizzle ORM schema for Neon Postgres with Row-Level Security (RLS)
 * Authentication: Clerk (user ID passed via set_config)
 *
 * Structure:
 * - users: Synced from Clerk, owns plans
 * - plans: Container for all user data, future-proofed for sharing
 * - entries: Generic storage for all entry types (taskKey determines type)
 *
 * Note: The frontend controls entry type definitions and metadata validation.
 * The backend accepts generic entries identified by taskKey.
 */

import { sql } from 'drizzle-orm';
import { crudPolicy } from 'drizzle-orm/neon';
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// =============================================================================
// HELPER: RLS Policy Expression
// =============================================================================

/**
 * Returns SQL expression that checks if the current user owns the plan.
 * Used in RLS policies to restrict access to rows where the user owns the plan.
 *
 * Expects `app.user_id` to be set via:
 *   SET LOCAL app.user_id = 'clerk_user_id';
 *
 * NOTE: Uses raw SQL string for table/column references to avoid circular
 * initialization issues with drizzle-kit snapshot generation.
 */
const userOwnsPlan = (planIdColumn: AnyPgColumn) => sql`
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = ${planIdColumn} 
    AND plans.user_id = current_setting('app.user_id', true)
  )
`;

const userOwnsPlanPolicy = (planIdColumn: AnyPgColumn) =>
  crudPolicy({
    role: 'public',
    read: userOwnsPlan(planIdColumn),
    modify: userOwnsPlan(planIdColumn),
  });

/**
 * Direct user ownership check for tables with user_id column
 * NOTE: Uses raw SQL string to avoid circular initialization issues
 */
const isCurrentUser = (userIdColumn: AnyPgColumn) =>
  sql`${userIdColumn} = current_setting('app.user_id', true)`;

const isCurrentUserPolicy = (userIdColumn: AnyPgColumn) =>
  crudPolicy({
    role: 'public',
    read: isCurrentUser(userIdColumn),
    modify: isCurrentUser(userIdColumn),
  });

const shouldBypassRls = () =>
  sql`'on' = current_setting('app.bypass_rls_status', true)`;

const shouldBypassRlsPolicy = () => [
  pgPolicy('bypass_rls_policy', {
    to: 'public',
    using: shouldBypassRls(),
  }),
];

// =============================================================================
// TABLES
// =============================================================================

/**
 * Users table - synced from Clerk
 *
 * This table stores basic user info synced from Clerk.
 * The id is the Clerk user ID (text, not UUID).
 */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // Clerk user ID
    firstName: text('first_name'),
    lastName: text('last_name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [shouldBypassRlsPolicy(), isCurrentUserPolicy(table.id)],
).enableRLS();

/**
 * Subscriptions table - tracks user subscription tier
 *
 * Each user has exactly one subscription record that determines their
 * entitlements (feature access and quotas). Created automatically when
 * a user signs up, defaulting to 'free' tier.
 *
 * Future Stripe integration will update tier via webhooks.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    tier: text('tier').notNull().default('free'),

    // Future Stripe fields (nullable)
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('subscriptions_user_id_idx').on(table.userId),
    shouldBypassRlsPolicy(),
    isCurrentUserPolicy(table.userId),
  ],
).enableRLS();

/**
 * Plans table - container for all user data
 *
 * Each user can have multiple plans:
 * - 'self' plan: for the account holder's own legacy
 * - 'dependent' plan: managed on behalf of someone else (e.g., parent, grandparent)
 *
 * This indirection allows:
 * - Future sharing: multiple users can access one plan
 * - Clean RLS: all data tables reference plan_id, not user_id
 * - Logical grouping: "my legacy plan" as a concept
 */
export const plans = pgTable(
  'plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .default(sql`current_setting('app.user_id', true)`)
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').default('My Legacy Plan').notNull(),
    planType: text('plan_type').default('self').notNull(), // 'self' | 'dependent'
    forName: text('for_name'), // Name of person this plan is for (if dependent)
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('plans_user_id_idx').on(table.userId),
    shouldBypassRlsPolicy(),
    isCurrentUserPolicy(table.userId),
  ],
).enableRLS();

// =============================================================================
// ENTRIES
// =============================================================================

/**
 * Entries table - generic storage for all entry types
 *
 * The taskKey identifies the entry type (controlled by frontend).
 * Metadata is a flexible JSONB field for type-specific data.
 * The backend does not validate metadata structure beyond ensuring valid JSON.
 */
export const entries = pgTable(
  'entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),

    // Common fields
    taskKey: text('task_key').notNull(),
    title: text('title'), // Display name / summary (optional)
    notes: text('notes'), // General notes (optional)
    sortOrder: integer('sort_order').default(0).notNull(),

    // Category-specific data
    metadata: jsonb('metadata').default({}).notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('entries_plan_id_idx').on(table.planId),
    index('entries_category_idx').on(table.planId, table.taskKey),
    shouldBypassRlsPolicy(),
    userOwnsPlanPolicy(table.planId),
  ],
).enableRLS();

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
