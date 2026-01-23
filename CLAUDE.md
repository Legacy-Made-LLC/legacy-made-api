# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev      # Start in watch mode
npm run start:debug    # Start with debugger

# Build
npm run build          # Build with nest

# Testing
npm test               # Run unit tests
npm test -- --watch    # Watch mode
npm test -- <pattern>  # Run specific test file (e.g., npm test -- auth)
npm run test:e2e       # Run e2e tests
npm run test:cov       # Run with coverage

# Linting/Formatting
npm run lint           # ESLint with auto-fix
npm run format         # Prettier

# Database (Drizzle)
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit push       # Push schema directly (dev only)
npx drizzle-kit migrate    # Run migrations
```

## Code Generation

**Always use the Nest CLI to generate modules, services, controllers, and other elements.**

Structure convention: Each module gets its own directory in `src/`, but files within a module should be flat (not nested in subdirectories). Use `--flat` when generating elements into existing modules.

```bash
# Generate a new module (creates src/plans/plans.module.ts)
npx nest g module plans

# Generate into existing module with flat structure (note: module/name pattern)
npx nest g service plans/plans --flat      # Creates src/plans/plans.service.ts
npx nest g controller plans/plans --flat   # Creates src/plans/plans.controller.ts

# Other common generators (into their respective module directories)
npx nest g guard auth/auth --flat          # src/auth/auth.guard.ts
npx nest g middleware auth/logging --flat  # src/auth/logging.middleware.ts
npx nest g pipe plans/validation --flat    # src/plans/validation.pipe.ts
npx nest g interceptor plans/transform --flat
npx nest g filter common/http-exception --flat
npx nest g decorator auth/roles --flat

# Useful flags
--dry-run    # Preview without writing files
--skip-import # Don't auto-add to module
```

**Testing requirements:**
- **Never use `--no-spec`** - Always generate test files with new modules/services/controllers
- After generating new files, run `npm test` to verify the default tests pass
- If a generated spec file fails, fix it immediately before continuing

Available schematics: `module` (mo), `controller` (co), `service` (s), `guard` (gu), `middleware` (mi), `pipe` (pi), `interceptor` (itc), `filter` (f), `decorator` (d), `class` (cl), `interface` (itf), `resource` (res), `gateway` (ga), `resolver` (r)

### DTO Validation

Most endpoints accepting a JSON request body should use DTO validation. Modules with CRUD endpoints should have a `dto` subdirectory containing Zod-based DTOs.

**Structure:** `src/<module>/dto/<name>.dto.ts`

**Pattern:**
```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export class CreatePlanDto extends createZodDto(createPlanSchema) {}
```

**Naming conventions:**
- File: `<name>.dto.ts` (e.g., `create-plan.dto.ts`, `update-plan.dto.ts`)
- Schema: `<name>Schema` (e.g., `createPlanSchema`, `updatePlanSchema`)
- Class: `<Name>Dto` (e.g., `CreatePlanDto`, `UpdatePlanDto`)

**Discriminated unions:** `createZodDto()` does not support `z.discriminatedUnion()` due to a TypeScript limitation (TS2509 - cannot extend a union type). See [nestjs-zod#41](https://github.com/BenLorantfy/nestjs-zod/issues/41).

Workaround - use a type alias and apply validation directly in the controller:
```typescript
// In DTO file
export const createEntrySchema = z.discriminatedUnion('category', [...]);
export type CreateEntryDto = z.infer<typeof createEntrySchema>;

// In controller
@Post()
create(@Body(new ZodValidationPipe(createEntrySchema)) dto: CreateEntryDto) {
  return this.service.create(dto);
}
```

**Query Parameter DTOs:** Use the same pattern for validating query parameters. Create a DTO with a Zod schema and use it with the `@Query()` decorator:
```typescript
// In DTO file (e.g., list-entries-query.dto.ts)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const listEntriesQuerySchema = z.object({
  category: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export class ListEntriesQueryDto extends createZodDto(listEntriesQuerySchema) {}

// In controller
@Get()
findAll(@Query() query: ListEntriesQueryDto) {
  return this.service.findAll(query);
}
```

Note: Use `z.coerce.number()` for numeric query params since they arrive as strings.

**Passing query DTOs to services:** Pass the query DTO to the service's `findAll` method. The query parameter should be optional so the method can be called without filters:
```typescript
// In service
async findAll(planId: string, query?: FindEntriesQueryDto) {
  return this.db.rls(async (tx) => {
    const conditions = [eq(entries.planId, planId)];

    if (query?.taskKey) {
      conditions.push(eq(entries.taskKey, query.taskKey));
    }

    return tx
      .select()
      .from(entries)
      .where(and(...conditions));
  });
}

// In controller
@Get('plans/:planId/entries')
findAll(
  @Param('planId', ParseUUIDPipe) planId: string,
  @Query() query: FindEntriesQueryDto,
) {
  return this.service.findAll(planId, query);
}
```

**Passing DTOs to Drizzle:** Pass validated DTOs directly to `.values()` and `.set()` methods. The Zod schema ensures the data shape matches the database schema, so manual attribute mapping is unnecessary:
```typescript
// Good - pass DTO directly
async create(dto: CreatePlanDto) {
  const [plan] = await this.db.drizzle.insert(plans).values(dto).returning();
  return plan;
}

async update(id: string, dto: UpdatePlanDto) {
  const [updated] = await this.db.drizzle.update(plans).set(dto).where(eq(plans.id, id)).returning();
  return updated;
}

// Bad - manual mapping is superfluous
async create(dto: CreatePlanDto) {
  const [plan] = await this.db.drizzle.insert(plans).values({
    name: dto.name,
    description: dto.description,
  }).returning();
  return plan;
}
```

## Architecture

**NestJS API** with Drizzle ORM targeting Neon Postgres with Row-Level Security (RLS).

### Core Modules

- **AppModule** (`src/app.module.ts`) - Root module with global ConfigModule using Zod validation
- **ApiConfigModule** (`src/config/`) - Global typed configuration wrapper around NestJS ConfigService
- **DbModule** (`src/db/`) - Global Drizzle ORM instance
- **AuthModule** (`src/auth/`) - Authentication (Clerk integration planned)

### Configuration

Environment variables are validated at startup via Zod schema in `src/config.ts`. Use `ApiConfigService.get()` for type-safe config access.

Required env vars: `DATABASE_URL`

### Database Schema

Schema defined in `src/schema.ts` using Drizzle. All tables use RLS policies that check `app.user_id` session variable.

**Domain model (4 pillars):**
1. **Entries** - Important information (contacts, financial, insurance, legal docs, home, digital access)
2. **Wishes** - Personal preferences and guidance
3. **Trusted Contacts** - Family access management with access levels
4. **Messages** - Legacy messages (personal, reflections, milestones)

**Key pattern:** All user data belongs to a `Plan`, which belongs to a `User`. RLS policies use `userOwnsPlan()` helper to check ownership via plan_id.

### RLS Authentication Pattern

For authenticated queries, set the user context before executing:
```sql
SET LOCAL app.user_id = 'clerk_user_id';
```

Migrations are in `./migrations/` directory.
