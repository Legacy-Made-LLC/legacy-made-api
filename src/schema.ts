/**
 * Legacy Made - Database Schema
 *
 * Drizzle ORM schema for Neon Postgres with Row-Level Security (RLS)
 * Authentication: Clerk (user ID passed via set_config)
 *
 * Structure:
 * - users: Synced from Clerk, owns plans
 * - plans: Container for all user data, future-proofed for sharing
 * - entries: Flexible storage for Important Information (Pillar 1)
 * - wishes: Wishes & Guidance (Pillar 2)
 * - trusted_contacts: Family Access management (Pillar 3)
 * - messages: Legacy Messages (Pillar 4)
 */

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
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
 */
const userOwnsPlan = (planIdColumn: AnyPgColumn) => sql`
  EXISTS (
    SELECT 1 FROM plans 
    WHERE plans.id = ${planIdColumn} 
    AND plans.user_id = current_setting('app.user_id', true)
  )
`;

/**
 * Direct user ownership check for tables with user_id column
 */
const isCurrentUser = (userIdColumn: AnyPgColumn) => sql`
  ${userIdColumn} = current_setting('app.user_id', true)
`;

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Categories for entries in the Important Information pillar
 */
export const entryCategoryEnum = pgEnum('entry_category', [
  'contact', // Who to contact first
  'financial', // Financial and account information
  'insurance', // Insurance details
  'legal_document', // Legal and identity documents (locations)
  'home', // Home, vehicle, and ongoing responsibilities
  'digital_access', // Digital access guidance
]);

/**
 * Priority levels for contacts and other entries
 */
export const priorityEnum = pgEnum('priority', [
  'primary',
  'secondary',
  'backup',
]);

/**
 * Access levels for trusted contacts (Pillar 3)
 */
export const accessLevelEnum = pgEnum('access_level', [
  'full', // Can see everything
  'limited', // Can see most things, some restrictions
  'minimal', // Only essential information
]);

/**
 * Message types for Legacy Messages (Pillar 4)
 */
export const messageTypeEnum = pgEnum('message_type', [
  'personal', // Personal messages to loved ones
  'reflection', // Reflections on values, lessons, life
  'milestone', // Messages for future milestones
]);

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
      .notNull(),
  },
  (table) => [
    // RLS: Users can only read/update their own row
    pgPolicy('users_select_own', {
      for: 'select',
      using: isCurrentUser(table.id),
    }),
    pgPolicy('users_update_own', {
      for: 'update',
      using: isCurrentUser(table.id),
      withCheck: isCurrentUser(table.id),
    }),
  ],
).enableRLS();

/**
 * Plans table - container for all user data
 *
 * Each user has one plan (for now). This indirection allows:
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
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').default('My Legacy Plan').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('plans_user_id_idx').on(table.userId),
    // RLS: Users can only access their own plans
    pgPolicy('plans_select_own', {
      for: 'select',
      using: isCurrentUser(table.userId),
    }),
    pgPolicy('plans_insert_own', {
      for: 'insert',
      withCheck: isCurrentUser(table.userId),
    }),
    pgPolicy('plans_update_own', {
      for: 'update',
      using: isCurrentUser(table.userId),
      withCheck: isCurrentUser(table.userId),
    }),
    pgPolicy('plans_delete_own', {
      for: 'delete',
      using: isCurrentUser(table.userId),
    }),
  ],
).enableRLS();

// =============================================================================
// PILLAR 1: Important Information
// =============================================================================

/**
 * Entries table - flexible storage for Important Information
 *
 * Uses a category enum + JSONB metadata pattern for flexibility.
 * Common fields are columns; category-specific data lives in metadata.
 *
 * Metadata shapes by category (enforced at app layer with Zod):
 *
 * contact: {
 *   firstName: string,
 *   lastName: string,
 *   relationship: string,
 *   phone?: string,
 *   email?: string,
 *   address?: string,
 *   reason?: string  // Why contact this person
 * }
 *
 * financial: {
 *   institution: string,
 *   accountType: string,
 *   accountNumber?: string (partial/masked),
 *   contactInfo?: string,
 *   notes?: string
 * }
 *
 * insurance: {
 *   provider: string,
 *   policyType: string,
 *   policyNumber?: string,
 *   contactInfo?: string,
 *   coverageDetails?: string
 * }
 *
 * legal_document: {
 *   documentType: string,
 *   location: string,  // Physical or digital location
 *   holder?: string,   // Attorney, safe deposit, etc.
 *   notes?: string
 * }
 *
 * home: {
 *   responsibilityType: string,  // mortgage, utilities, maintenance, etc.
 *   provider?: string,
 *   accountInfo?: string,
 *   frequency?: string,  // monthly, annual, etc.
 *   notes?: string
 * }
 *
 * digital_access: {
 *   service: string,
 *   username?: string,
 *   recoveryEmail?: string,
 *   notes?: string,
 *   // NOTE: Never store actual passwords - only hints/guidance
 * }
 */
export const entries = pgTable(
  'entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),

    // Common fields
    category: entryCategoryEnum('category').notNull(),
    title: text('title').notNull(), // Display name / summary
    notes: text('notes'), // General notes
    priority: priorityEnum('priority'), // For contacts especially
    sortOrder: integer('sort_order').default(0).notNull(),

    // Category-specific data
    metadata: jsonb('metadata').default({}).notNull(),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('entries_plan_id_idx').on(table.planId),
    index('entries_category_idx').on(table.planId, table.category),
    // RLS: Users can only access entries in their plans
    pgPolicy('entries_select_own', {
      for: 'select',
      using: userOwnsPlan(table.planId),
    }),
    pgPolicy('entries_insert_own', {
      for: 'insert',
      withCheck: userOwnsPlan(table.planId),
    }),
    pgPolicy('entries_update_own', {
      for: 'update',
      using: userOwnsPlan(table.planId),
      withCheck: userOwnsPlan(table.planId),
    }),
    pgPolicy('entries_delete_own', {
      for: 'delete',
      using: userOwnsPlan(table.planId),
    }),
  ],
).enableRLS();

// =============================================================================
// PILLAR 2: Wishes & Guidance
// =============================================================================

/**
 * Wishes table - personal preferences, guidance, and explanations
 *
 * Captures the "why" behind decisions and preferences.
 * More free-form than entries, focused on guidance and context.
 */
export const wishes = pgTable(
  'wishes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    content: text('content').notNull(), // The actual wish/guidance
    category: text('category'), // Optional categorization
    sortOrder: integer('sort_order').default(0).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('wishes_plan_id_idx').on(table.planId),
    // RLS
    pgPolicy('wishes_select_own', {
      for: 'select',
      using: userOwnsPlan(table.planId),
    }),
    pgPolicy('wishes_insert_own', {
      for: 'insert',
      withCheck: userOwnsPlan(table.planId),
    }),
    pgPolicy('wishes_update_own', {
      for: 'update',
      using: userOwnsPlan(table.planId),
      withCheck: userOwnsPlan(table.planId),
    }),
    pgPolicy('wishes_delete_own', {
      for: 'delete',
      using: userOwnsPlan(table.planId),
    }),
  ],
).enableRLS();

// =============================================================================
// PILLAR 3: Family Access
// =============================================================================

/**
 * Trusted Contacts table - who can access the plan and at what level
 *
 * These are the people designated to receive access to the plan.
 * Different from "contact" entries - these are access grants, not directory entries.
 */
export const trustedContacts = pgTable(
  'trusted_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),

    // Contact info
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    relationship: text('relationship'), // Spouse, child, attorney, etc.

    // Access configuration
    accessLevel: accessLevelEnum('access_level').default('limited').notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(), // Primary point person

    // Notes about this person's role
    notes: text('notes'),
    sortOrder: integer('sort_order').default(0).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('trusted_contacts_plan_id_idx').on(table.planId),
    // RLS
    pgPolicy('trusted_contacts_select_own', {
      for: 'select',
      using: userOwnsPlan(table.planId),
    }),
    pgPolicy('trusted_contacts_insert_own', {
      for: 'insert',
      withCheck: userOwnsPlan(table.planId),
    }),
    pgPolicy('trusted_contacts_update_own', {
      for: 'update',
      using: userOwnsPlan(table.planId),
      withCheck: userOwnsPlan(table.planId),
    }),
    pgPolicy('trusted_contacts_delete_own', {
      for: 'delete',
      using: userOwnsPlan(table.planId),
    }),
  ],
).enableRLS();

// =============================================================================
// PILLAR 4: Legacy Messages
// =============================================================================

/**
 * Messages table - personal messages, reflections, and milestone notes
 *
 * The emotional/meaningful content - voice, story, perspective.
 * Supports different types: personal to individuals, general reflections, future milestones.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),

    type: messageTypeEnum('type').default('personal').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),

    // For personal messages - who is it for?
    recipientName: text('recipient_name'),

    // For milestone messages - what's the occasion?
    milestoneDate: timestamp('milestone_date', { withTimezone: true }),
    milestoneDescription: text('milestone_description'),

    sortOrder: integer('sort_order').default(0).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('messages_plan_id_idx').on(table.planId),
    index('messages_type_idx').on(table.planId, table.type),
    // RLS
    pgPolicy('messages_select_own', {
      for: 'select',
      using: userOwnsPlan(table.planId),
    }),
    pgPolicy('messages_insert_own', {
      for: 'insert',
      withCheck: userOwnsPlan(table.planId),
    }),
    pgPolicy('messages_update_own', {
      for: 'update',
      using: userOwnsPlan(table.planId),
      withCheck: userOwnsPlan(table.planId),
    }),
    pgPolicy('messages_delete_own', {
      for: 'delete',
      using: userOwnsPlan(table.planId),
    }),
  ],
).enableRLS();

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type EntryCategory = (typeof entryCategoryEnum.enumValues)[number];

export type Wish = typeof wishes.$inferSelect;
export type NewWish = typeof wishes.$inferInsert;

export type TrustedContact = typeof trustedContacts.$inferSelect;
export type NewTrustedContact = typeof trustedContacts.$inferInsert;
export type AccessLevel = (typeof accessLevelEnum.enumValues)[number];

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageType = (typeof messageTypeEnum.enumValues)[number];
