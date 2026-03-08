import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { EmailService } from '../email/email.service';
import { KmsService } from './kms.service';
import {
  userKeys,
  encryptedDeks,
  keyRecoveryEvents,
  plans,
  users,
} from '../schema';
import {
  RegisterPublicKeyDto,
  StoreEncryptedDekDto,
  EnableEscrowDto,
  InitiateRecoveryDto,
  SetupEncryptionDto,
} from './dto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);

  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
    private readonly kms: KmsService,
    private readonly email: EmailService,
  ) {}

  // =========================================================================
  // User Keys
  // =========================================================================

  /**
   * First-launch setup: register the first public key and store the initial
   * owner DEK copy atomically. Throws ConflictException if any keys exist.
   */
  async setupEncryption(dto: SetupEncryptionDto) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [existing] = await tx
        .select({ id: userKeys.id })
        .from(userKeys)
        .where(eq(userKeys.userId, userId));

      if (existing) {
        throw new ConflictException(
          'Encryption already set up. Use POST /encryption/keys to add more keys.',
        );
      }

      const [key] = await tx
        .insert(userKeys)
        .values({
          userId,
          publicKey: dto.publicKey,
          keyVersion: 1,
          keyType: 'device',
          deviceLabel: dto.deviceLabel,
        })
        .returning();

      const [dek] = await tx
        .insert(encryptedDeks)
        .values({
          planId: dto.planId,
          ownerId: userId,
          recipientId: userId,
          dekType: 'owner',
          encryptedDek: dto.encryptedDek,
          keyVersion: 1,
        })
        .returning();

      return { keyVersion: key.keyVersion, dekId: dek.id };
    });
  }

  /**
   * Register an additional public key for the current user.
   * Requires at least one key to exist (use setupEncryption for the first key).
   * Uses SELECT ... FOR UPDATE to prevent key_version race conditions.
   */
  async registerPublicKey(dto: RegisterPublicKeyDto) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      // Lock rows and get max version to prevent race conditions
      const rows = await tx.execute(
        sql`SELECT key_version FROM user_keys WHERE user_id = ${userId} ORDER BY key_version DESC FOR UPDATE`,
      );

      if (!rows.rows.length) {
        throw new NotFoundException(
          'No keys registered. Use POST /encryption/setup first.',
        );
      }

      const maxVersion = rows.rows[0].key_version as number;
      const nextVersion = maxVersion + 1;

      const [key] = await tx
        .insert(userKeys)
        .values({
          userId,
          publicKey: dto.publicKey,
          keyVersion: nextVersion,
          keyType: dto.keyType,
          deviceLabel: dto.deviceLabel,
        })
        .returning();

      return key;
    });
  }

  /**
   * Delete a key by version for the current user.
   * Also deletes all encrypted DEK copies for this key version in the same transaction.
   */
  async deleteKey(keyVersion: number) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      await tx
        .delete(userKeys)
        .where(
          and(eq(userKeys.userId, userId), eq(userKeys.keyVersion, keyVersion)),
        );

      await tx
        .delete(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.recipientId, userId),
            eq(encryptedDeks.keyVersion, keyVersion),
          ),
        );

      return { deleted: true, keyVersion };
    });
  }

  /**
   * Get all public keys for the current user, ordered by keyVersion.
   */
  async getMyKeys() {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      return tx
        .select()
        .from(userKeys)
        .where(eq(userKeys.userId, userId))
        .orderBy(userKeys.keyVersion);
    });
  }

  /**
   * Get another user's public keys (for key exchange).
   */
  async getUserKeys(userId: string) {
    return this.db.rls(async (tx) => {
      return tx
        .select({
          userId: userKeys.userId,
          publicKey: userKeys.publicKey,
          keyVersion: userKeys.keyVersion,
          keyType: userKeys.keyType,
          deviceLabel: userKeys.deviceLabel,
        })
        .from(userKeys)
        .where(eq(userKeys.userId, userId))
        .orderBy(userKeys.keyVersion);
    });
  }

  // =========================================================================
  // Encrypted DEKs
  // =========================================================================

  /**
   * Store an encrypted DEK copy. The owner is the current user.
   */
  async storeEncryptedDek(dto: StoreEncryptedDekDto) {
    const ownerId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [dek] = await tx
        .insert(encryptedDeks)
        .values({
          planId: dto.planId,
          ownerId,
          recipientId: dto.recipientId,
          dekType: dto.dekType,
          encryptedDek: dto.encryptedDek,
          keyVersion: dto.keyVersion,
        })
        .onConflictDoUpdate({
          target: [
            encryptedDeks.planId,
            encryptedDeks.ownerId,
            encryptedDeks.recipientId,
            encryptedDeks.keyVersion,
            encryptedDeks.dekType,
          ],
          set: {
            encryptedDek: dto.encryptedDek,
          },
        })
        .returning();

      return dek;
    });
  }

  /**
   * Get my DEK copies from a specific owner for a specific plan (I am the recipient).
   * Returns an array (multiple copies at different keyVersions).
   */
  async getMyEncryptedDeks(ownerId: string, planId: string) {
    const recipientId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      return tx
        .select()
        .from(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.ownerId, ownerId),
            eq(encryptedDeks.recipientId, recipientId),
            eq(encryptedDeks.planId, planId),
          ),
        );
    });
  }

  /**
   * List all DEK copies I own (I am the data owner).
   * Optionally filter by planId.
   */
  async getEncryptedDeksForOwner(planId?: string) {
    const ownerId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const conditions = [eq(encryptedDeks.ownerId, ownerId)];

      if (planId) {
        conditions.push(eq(encryptedDeks.planId, planId));
      }

      return tx
        .select()
        .from(encryptedDeks)
        .where(and(...conditions));
    });
  }

  /**
   * Delete a contact's DEK copy (revocation). Owner only.
   * Scoped to a specific plan.
   */
  async deleteContactDek(recipientId: string, planId: string) {
    const ownerId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      await tx
        .delete(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.ownerId, ownerId),
            eq(encryptedDeks.recipientId, recipientId),
            eq(encryptedDeks.dekType, 'contact'),
            eq(encryptedDeks.planId, planId),
          ),
        );

      return { deleted: true };
    });
  }

  /**
   * Check if DEK copies exist for a given owner/recipient/plan combination.
   * Returns array of DEK entries for multi-key visibility.
   */
  async getDekStatus(ownerId: string, recipientId: string, planId: string) {
    return this.db.rls(async (tx) => {
      const deks = await tx
        .select({
          dekType: encryptedDeks.dekType,
          keyVersion: encryptedDeks.keyVersion,
        })
        .from(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.ownerId, ownerId),
            eq(encryptedDeks.recipientId, recipientId),
            eq(encryptedDeks.planId, planId),
          ),
        );

      return { exists: deks.length > 0, deks };
    });
  }

  // =========================================================================
  // KMS Escrow
  // =========================================================================

  /**
   * Enable KMS escrow by encrypting the DEK with KMS and storing it.
   * Client sends the base64-encoded DEK plaintext.
   */
  async enableEscrow(dto: EnableEscrowDto) {
    const userId = this.cls.requireUserId();

    const dekBuffer = Buffer.from(dto.dekPlaintext, 'base64');
    const encryptedBuffer = await this.kms.encryptDek(dekBuffer);
    const encryptedDekBase64 = encryptedBuffer.toString('base64');

    // Zero out the plaintext buffer
    dekBuffer.fill(0);

    return this.db.rls(async (tx) => {
      const [dek] = await tx
        .insert(encryptedDeks)
        .values({
          planId: dto.planId,
          ownerId: userId,
          recipientId: userId,
          dekType: 'escrow',
          encryptedDek: encryptedDekBase64,
          keyVersion: 0, // KMS-encrypted, not tied to user key version
        })
        .onConflictDoUpdate({
          target: [
            encryptedDeks.planId,
            encryptedDeks.ownerId,
            encryptedDeks.recipientId,
            encryptedDeks.keyVersion,
            encryptedDeks.dekType,
          ],
          set: {
            encryptedDek: encryptedDekBase64,
          },
        })
        .returning();

      return { id: dek.id, enabled: true };
    });
  }

  /**
   * Initiate KMS recovery.
   * Decrypts the escrow DEK via KMS and returns the plaintext over TLS.
   * Logs the event and sends email notification.
   */
  async initiateRecovery(
    dto: InitiateRecoveryDto,
    ipAddress: string,
    userAgent: string,
  ) {
    const userId = this.cls.requireUserId();

    // Log recovery initiation
    await this.db.rls(async (tx) => {
      await tx.insert(keyRecoveryEvents).values({
        userId,
        eventType: 'recovery_initiated',
        ipAddress,
        userAgent,
        details: { newPublicKey: dto.newPublicKey },
      });
    });

    try {
      // Find escrow DEK for the specified plan
      const escrowDek = await this.db.rls(async (tx) => {
        const [dek] = await tx
          .select()
          .from(encryptedDeks)
          .where(
            and(
              eq(encryptedDeks.ownerId, userId),
              eq(encryptedDeks.recipientId, userId),
              eq(encryptedDeks.dekType, 'escrow'),
              eq(encryptedDeks.planId, dto.planId),
            ),
          );

        if (!dek) {
          throw new NotFoundException(
            'No escrow DEK found. Escrow not enabled.',
          );
        }

        return dek;
      });

      // Decrypt via KMS
      const encryptedBuffer = Buffer.from(escrowDek.encryptedDek, 'base64');
      const dekPlaintext = await this.kms.decryptDek(encryptedBuffer);
      const dekPlaintextBase64 = dekPlaintext.toString('base64');

      // Zero out the buffer after converting to base64
      dekPlaintext.fill(0);

      // Log recovery completion
      await this.db.rls(async (tx) => {
        await tx.insert(keyRecoveryEvents).values({
          userId,
          eventType: 'recovery_completed',
          ipAddress,
          userAgent,
        });
      });

      // Send email notification (fire and forget)
      this.sendRecoveryNotification(userId, ipAddress, userAgent).catch(
        (error) => {
          this.logger.error('Failed to send recovery notification', error);
        },
      );

      return { dekPlaintext: dekPlaintextBase64 };
    } catch (error) {
      // Log failure if it's not already a known exception
      if (!(error instanceof NotFoundException)) {
        await this.db.rls(async (tx) => {
          await tx.insert(keyRecoveryEvents).values({
            userId,
            eventType: 'recovery_failed',
            ipAddress,
            userAgent,
            details: {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        });
      }
      throw error;
    }
  }

  /**
   * Get recovery event audit history for the current user.
   */
  async getRecoveryEvents() {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      return tx
        .select()
        .from(keyRecoveryEvents)
        .where(eq(keyRecoveryEvents.userId, userId))
        .orderBy(keyRecoveryEvents.createdAt);
    });
  }

  // =========================================================================
  // E2EE Plan Status
  // =========================================================================

  /**
   * Enable E2EE for a plan (owner only, enforced by RLS).
   */
  async enableE2ee(planId: string) {
    return this.db.rls(async (tx) => {
      const [updated] = await tx
        .update(plans)
        .set({ e2eeEnabled: true })
        .where(eq(plans.id, planId))
        .returning();

      if (!updated) {
        throw new NotFoundException('Plan not found');
      }

      return { planId: updated.id, e2eeEnabled: updated.e2eeEnabled };
    });
  }

  /**
   * Get E2EE status for a plan.
   */
  async getE2eeStatus(planId: string) {
    return this.db.rls(async (tx) => {
      const [plan] = await tx
        .select({ id: plans.id, e2eeEnabled: plans.e2eeEnabled })
        .from(plans)
        .where(eq(plans.id, planId));

      if (!plan) {
        throw new NotFoundException('Plan not found');
      }

      return { planId: plan.id, e2eeEnabled: plan.e2eeEnabled };
    });
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async sendRecoveryNotification(
    userId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    // Look up user email via bypassRls (we're in an async context)
    const user = await this.db.bypassRls(async (tx) => {
      const [u] = await tx
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, userId));
      return u;
    });

    if (!user?.email) {
      this.logger.warn(
        `Cannot send recovery notification: no email for user ${userId}`,
      );
      return;
    }

    await this.email.sendRecoveryNotification({
      to: user.email,
      firstName: user.firstName ?? 'there',
      ipAddress,
      userAgent,
      recoveredAt: new Date(),
    });
  }
}
