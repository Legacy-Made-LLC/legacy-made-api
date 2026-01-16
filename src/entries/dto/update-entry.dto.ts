import { z } from 'zod';
import {
  contactMetadataSchema,
  digitalAccessMetadataSchema,
  financialMetadataSchema,
  homeMetadataSchema,
  insuranceMetadataSchema,
  legalDocumentMetadataSchema,
  prioritySchema,
} from './create-entry.dto';

// For updates, all fields are optional except we need category to validate metadata
const baseUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  priority: prioritySchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
});

// When updating, category determines metadata shape validation
// Category itself cannot be changed (enforced at service layer)
export const updateEntrySchema = z.discriminatedUnion('category', [
  baseUpdateSchema.extend({
    category: z.literal('contact'),
    metadata: contactMetadataSchema.partial().optional(),
  }),
  baseUpdateSchema.extend({
    category: z.literal('financial'),
    metadata: financialMetadataSchema.partial().optional(),
  }),
  baseUpdateSchema.extend({
    category: z.literal('insurance'),
    metadata: insuranceMetadataSchema.partial().optional(),
  }),
  baseUpdateSchema.extend({
    category: z.literal('legal_document'),
    metadata: legalDocumentMetadataSchema.partial().optional(),
  }),
  baseUpdateSchema.extend({
    category: z.literal('home'),
    metadata: homeMetadataSchema.partial().optional(),
  }),
  baseUpdateSchema.extend({
    category: z.literal('digital_access'),
    metadata: digitalAccessMetadataSchema.partial().optional(),
  }),
]);

// Use type alias instead of class due to TS2509 limitation with discriminated unions
// See: https://github.com/BenLorantfy/nestjs-zod/issues/41
export type UpdateEntryDto = z.infer<typeof updateEntrySchema>;
