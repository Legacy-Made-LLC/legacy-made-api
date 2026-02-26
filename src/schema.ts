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
  uniqueIndex,
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
 * Returns SQL expression that checks if the current user has trusted contact
 * access to a plan with one of the specified access levels.
 *
 * Only matches contacts that are:
 * - accepted (access_status = 'accepted')
 * - immediate access (access_timing = 'immediate')
 * - at one of the specified access levels
 *
 * NOTE: accessLevels are compile-time constants, safe to embed via sql.raw().
 */
const userHasAccessToPlan = (
  planIdColumn: AnyPgColumn,
  accessLevels: string[],
) => {
  const levelsList = accessLevels.map((l) => `'${l}'`).join(', ');
  return sql`
    EXISTS (
      SELECT 1 FROM trusted_contacts
      WHERE trusted_contacts.plan_id = ${planIdColumn}
      AND trusted_contacts.clerk_user_id = current_setting('app.user_id', true)
      AND trusted_contacts.access_status = 'accepted'
      AND trusted_contacts.access_timing = 'immediate'
      AND trusted_contacts.access_level IN (${sql.raw(levelsList)})
    )
  `;
};

/**
 * Combined read policy: user owns the plan OR is an accepted trusted contact
 * with one of the specified access levels.
 */
const ownerOrTrustedContactPolicy = (
  planIdColumn: AnyPgColumn,
  readAccessLevels: string[],
  writeAccessLevels: string[] = ['full_edit'],
) =>
  crudPolicy({
    role: 'public',
    read: sql`(${userOwnsPlan(planIdColumn)}) OR (${userHasAccessToPlan(planIdColumn, readAccessLevels)})`,
    modify: sql`(${userOwnsPlan(planIdColumn)}) OR (${userHasAccessToPlan(planIdColumn, writeAccessLevels)})`,
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
    email: text('email'),
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

    // Completion status (e.g., "draft", "pending", "complete") - frontend-controlled
    completionStatus: text('completion_status'),

    // Category-specific data
    metadata: jsonb('metadata').default({}).notNull(),
    metadataSchema: jsonb('metadata_schema'),

    // Audit trail - tracks who last modified this entry
    modifiedBy: text('modified_by').references(() => users.id),

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
    ownerOrTrustedContactPolicy(table.planId, ['full_edit', 'full_view']),
  ],
).enableRLS();

// =============================================================================
// WISHES
// =============================================================================

/**
 * Wishes table - storage for wishes and guidance items
 *
 * Similar to entries but for the "Wishes & Guidance" pillar.
 * The taskKey identifies the wish type (controlled by frontend).
 * Metadata is a flexible JSONB field for type-specific data.
 */
export const wishes = pgTable(
  'wishes',
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
    metadataSchema: jsonb('metadata_schema'),

    // Audit trail - tracks who last modified this wish
    modifiedBy: text('modified_by').references(() => users.id),

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
    index('wishes_plan_id_idx').on(table.planId),
    index('wishes_task_key_idx').on(table.planId, table.taskKey),
    shouldBypassRlsPolicy(),
    ownerOrTrustedContactPolicy(table.planId, [
      'full_edit',
      'full_view',
      'limited_view',
    ]),
  ],
).enableRLS();

// =============================================================================
// MESSAGES
// =============================================================================

/**
 * Messages table - storage for legacy messages
 *
 * Similar to entries and wishes but for the "Messages" pillar.
 * The taskKey identifies the message type (controlled by frontend).
 * Metadata is a flexible JSONB field for type-specific data.
 */
export const messages = pgTable(
  'messages',
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
    metadataSchema: jsonb('metadata_schema'),

    // Audit trail - tracks who last modified this message
    modifiedBy: text('modified_by').references(() => users.id),

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
    index('messages_plan_id_idx').on(table.planId),
    index('messages_task_key_idx').on(table.planId, table.taskKey),
    shouldBypassRlsPolicy(),
    ownerOrTrustedContactPolicy(table.planId, [
      'full_edit',
      'full_view',
      'limited_view',
    ]),
  ],
).enableRLS();

// =============================================================================
// PROGRESS
// =============================================================================

/**
 * Progress table - key-value store for tracking plan task completion
 *
 * Each (planId, key) pair maps to a JSONB data object containing arbitrary
 * progress state. Used by the frontend to persist user progress as they
 * work through plan tasks (e.g., which entries/wishes are complete).
 */
export const progress = pgTable(
  'progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    data: jsonb('data').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('progress_plan_id_key_idx').on(table.planId, table.key),
    index('progress_plan_id_idx').on(table.planId),
    shouldBypassRlsPolicy(),
    ownerOrTrustedContactPolicy(table.planId, [
      'full_edit',
      'full_view',
      'limited_view',
    ]),
  ],
).enableRLS();

// =============================================================================
// TRUSTED CONTACTS
// =============================================================================

/**
 * Trusted Contacts table - manages family access to plans
 *
 * Allows plan owners to grant access to their plan to other users.
 * Supports multiple access levels (full_edit, full_view, limited_view)
 * and timing modes (immediate, upon_passing).
 *
 * When a trusted contact accepts, their clerk_user_id is set, enabling
 * RLS policies to grant them access to the plan's data based on access_level.
 */
export const trustedContacts = pgTable(
  'trusted_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),

    // Contact information
    email: text('email').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    relationship: text('relationship'), // Free text (spouse, child, attorney, etc.)

    // Access configuration
    accessLevel: text('access_level').notNull(), // 'full_edit' | 'full_view' | 'limited_view'
    accessTiming: text('access_timing').notNull(), // 'immediate' | 'upon_passing'
    accessStatus: text('access_status').notNull().default('pending'), // 'pending' | 'accepted' | 'declined' | 'revoked_by_owner' | 'revoked_by_contact'

    // Linked user (set when invitation is accepted)
    clerkUserId: text('clerk_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    // Status timestamps
    invitedAt: timestamp('invited_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    // Plan owner's private notes about this contact
    notes: text('notes'),

    // Standard timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('trusted_contacts_plan_email_uniq').on(
      table.planId,
      table.email,
    ),
    index('trusted_contacts_plan_id_idx').on(table.planId),
    index('trusted_contacts_clerk_user_id_idx').on(table.clerkUserId),
    index('trusted_contacts_email_idx').on(table.email),
    shouldBypassRlsPolicy(),
    // Plan owners can fully manage their trusted contacts
    userOwnsPlanPolicy(table.planId),
    // Trusted contacts can read their own record (needed for RLS subqueries
    // on entries/wishes/messages that check trusted contact access)
    pgPolicy('trusted_contacts_self_read', {
      for: 'select',
      to: 'public',
      using: sql`${table.clerkUserId} = current_setting('app.user_id', true)`,
    }),
  ],
).enableRLS();

// =============================================================================
// PLAN ACTIVITY LOG
// =============================================================================

/**
 * Plan Activity Log table - audit trail for plan modifications
 *
 * Tracks who (owner or trusted contact) performed what action on plan data.
 * Critical for accountability when multiple users have edit access to a plan.
 */
export const planActivityLog = pgTable(
  'plan_activity_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),

    // Actor information
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').notNull(), // 'owner' | 'trusted_contact'

    // Action details
    action: text('action').notNull(), // 'created' | 'updated' | 'deleted'
    resourceType: text('resource_type').notNull(), // 'entry' | 'wish' | 'message' | 'trusted_contact'
    resourceId: uuid('resource_id'), // ID of the modified resource (nullable for bulk operations)

    // Optional metadata (old/new values, etc.)
    details: jsonb('details'),

    // Timestamp
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('plan_activity_log_plan_id_idx').on(table.planId),
    index('plan_activity_log_actor_user_id_idx').on(table.actorUserId),
    index('plan_activity_log_resource_idx').on(
      table.resourceType,
      table.resourceId,
    ),
    shouldBypassRlsPolicy(),
    // Only plan owners can read activity logs
    crudPolicy({
      role: 'public',
      read: userOwnsPlan(table.planId),
      modify: false,
    }),
    // Both owners and trusted contacts can insert log entries
    pgPolicy('plan_activity_log_insert', {
      for: 'insert',
      to: 'public',
      withCheck: sql`(${userOwnsPlan(table.planId)}) OR (${userHasAccessToPlan(table.planId, ['full_edit', 'full_view', 'limited_view'])})`,
    }),
  ],
).enableRLS();

// =============================================================================
// FILES
// =============================================================================

/**
 * Files table - stores metadata for uploaded files
 *
 * Files can be attached to entries, wishes, or messages (polymorphic relationship).
 * Exactly one of entryId, wishId, or messageId must be set.
 * Actual file storage is in Cloudflare R2 (documents, images, audio) or Mux (video).
 *
 * RLS policies ensure users can only access files belonging to their plans.
 */
export const files = pgTable(
  'files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Polymorphic: exactly one of entryId, wishId, or messageId must be set
    entryId: uuid('entry_id').references(() => entries.id, {
      onDelete: 'cascade',
    }),
    wishId: uuid('wish_id').references(() => wishes.id, {
      onDelete: 'cascade',
    }),
    messageId: uuid('message_id').references(() => messages.id, {
      onDelete: 'cascade',
    }),

    // File metadata
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),

    // Storage location
    storageType: text('storage_type').notNull(), // 'r2' | 'mux'
    storageKey: text('storage_key').notNull(), // R2 object key or Mux upload ID

    // Upload status (for multipart/async uploads)
    uploadStatus: text('upload_status').default('pending').notNull(), // 'pending' | 'uploading' | 'complete' | 'failed'

    // Mux-specific fields (null for R2 files)
    muxPlaybackId: text('mux_playback_id'),
    muxAssetId: text('mux_asset_id'),

    // Access control
    accessLevel: text('access_level').default('private').notNull(), // 'private' | 'shareable'
    shareToken: text('share_token'), // Unique token for shareable links
    shareExpiresAt: timestamp('share_expires_at', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('files_entry_id_idx').on(table.entryId),
    index('files_wish_id_idx').on(table.wishId),
    index('files_message_id_idx').on(table.messageId),
    index('files_share_token_idx').on(table.shareToken),
    shouldBypassRlsPolicy(),
    crudPolicy({
      role: 'public',
      read: sql`
        (
          ${table.entryId} IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = ${table.entryId}
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = e.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level IN ('full_edit', 'full_view')
              )
            )
          )
        )
        OR
        (
          ${table.wishId} IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = ${table.wishId}
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = w.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level IN ('full_edit', 'full_view', 'limited_view')
              )
            )
          )
        )
        OR
        (
          ${table.messageId} IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = ${table.messageId}
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = m.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level IN ('full_edit', 'full_view', 'limited_view')
              )
            )
          )
        )
      `,
      modify: sql`
        (
          ${table.entryId} IS NOT NULL AND EXISTS (
            SELECT 1 FROM entries e
            JOIN plans p ON p.id = e.plan_id
            WHERE e.id = ${table.entryId}
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = e.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          ${table.wishId} IS NOT NULL AND EXISTS (
            SELECT 1 FROM wishes w
            JOIN plans p ON p.id = w.plan_id
            WHERE w.id = ${table.wishId}
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = w.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
        OR
        (
          ${table.messageId} IS NOT NULL AND EXISTS (
            SELECT 1 FROM messages m
            JOIN plans p ON p.id = m.plan_id
            WHERE m.id = ${table.messageId}
            AND (
              p.user_id = current_setting('app.user_id', true)
              OR EXISTS (
                SELECT 1 FROM trusted_contacts tc
                WHERE tc.plan_id = m.plan_id
                AND tc.clerk_user_id = current_setting('app.user_id', true)
                AND tc.access_status = 'accepted'
                AND tc.access_timing = 'immediate'
                AND tc.access_level = 'full_edit'
              )
            )
          )
        )
      `,
    }),
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

export type Wish = typeof wishes.$inferSelect;
export type NewWish = typeof wishes.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type TrustedContact = typeof trustedContacts.$inferSelect;
export type NewTrustedContact = typeof trustedContacts.$inferInsert;

export type PlanActivityLog = typeof planActivityLog.$inferSelect;
export type NewPlanActivityLog = typeof planActivityLog.$inferInsert;

export type Progress = typeof progress.$inferSelect;
export type NewProgress = typeof progress.$inferInsert;

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
