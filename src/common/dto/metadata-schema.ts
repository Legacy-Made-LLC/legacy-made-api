import { z } from 'zod';

/**
 * Schema for individual field definitions within metadataSchema.
 *
 * Each field describes how a metadata key should be displayed and ordered.
 */
export const fieldSchemaSchema = z.object({
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  valueLabels: z.record(z.string(), z.string()).optional(),
});

export type FieldSchema = z.infer<typeof fieldSchemaSchema>;

/**
 * Schema for metadataSchema field on entries and wishes.
 *
 * Defines the structure and display metadata for the metadata field.
 * Used by the frontend to render custom fields.
 */
export const metadataSchemaSchema = z.object({
  version: z.number().int().positive(),
  fields: z.record(z.string(), fieldSchemaSchema),
});

export type MetadataSchema = z.infer<typeof metadataSchemaSchema>;
