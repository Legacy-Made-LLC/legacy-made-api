import { z } from 'zod';

// Category-specific metadata schemas
const contactMetadataSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  relationship: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  reason: z.string().optional(),
});

const financialMetadataSchema = z.object({
  institution: z.string().min(1),
  accountType: z.string().min(1),
  accountNumber: z.string().optional(),
  contactInfo: z.string().optional(),
  notes: z.string().optional(),
});

const insuranceMetadataSchema = z.object({
  provider: z.string().min(1),
  policyType: z.string().min(1),
  policyNumber: z.string().optional(),
  contactInfo: z.string().optional(),
  coverageDetails: z.string().optional(),
});

const legalDocumentMetadataSchema = z.object({
  documentType: z.string().min(1),
  location: z.string().min(1),
  holder: z.string().optional(),
  notes: z.string().optional(),
});

const homeMetadataSchema = z.object({
  responsibilityType: z.string().min(1),
  provider: z.string().optional(),
  accountInfo: z.string().optional(),
  frequency: z.string().optional(),
  notes: z.string().optional(),
});

const digitalAccessMetadataSchema = z.object({
  service: z.string().min(1),
  username: z.string().optional(),
  recoveryEmail: z.string().email().optional(),
  notes: z.string().optional(),
});

export const entryCategorySchema = z.enum([
  'contact',
  'financial',
  'insurance',
  'legal_document',
  'home',
  'digital_access',
]);

export const prioritySchema = z.enum(['primary', 'secondary', 'backup']);

// Base schema without discriminated union
const baseEntrySchema = z.object({
  planId: z.string().uuid(),
  title: z.string().min(1),
  notes: z.string().optional(),
  priority: prioritySchema.optional(),
  sortOrder: z.number().int().optional().default(0),
});

// Discriminated union for category-specific validation
export const createEntrySchema = z.discriminatedUnion('category', [
  baseEntrySchema.extend({
    category: z.literal('contact'),
    metadata: contactMetadataSchema,
  }),
  baseEntrySchema.extend({
    category: z.literal('financial'),
    metadata: financialMetadataSchema,
  }),
  baseEntrySchema.extend({
    category: z.literal('insurance'),
    metadata: insuranceMetadataSchema,
  }),
  baseEntrySchema.extend({
    category: z.literal('legal_document'),
    metadata: legalDocumentMetadataSchema,
  }),
  baseEntrySchema.extend({
    category: z.literal('home'),
    metadata: homeMetadataSchema,
  }),
  baseEntrySchema.extend({
    category: z.literal('digital_access'),
    metadata: digitalAccessMetadataSchema,
  }),
]);

// Use type alias instead of class due to TS2509 limitation with discriminated unions
// See: https://github.com/BenLorantfy/nestjs-zod/issues/41
export type CreateEntryDto = z.infer<typeof createEntrySchema>;

// Export metadata schemas for reuse
export {
  contactMetadataSchema,
  digitalAccessMetadataSchema,
  financialMetadataSchema,
  homeMetadataSchema,
  insuranceMetadataSchema,
  legalDocumentMetadataSchema,
};
