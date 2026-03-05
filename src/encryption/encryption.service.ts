import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
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
   * Register an initial public key for the current user.
   * Rejects if a key already exists (use rotatePublicKey instead).
   */
  async registerPublicKey(dto: RegisterPublicKeyDto) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [existing] = await tx
        .select({ id: userKeys.id })
        .from(userKeys)
        .where(eq(userKeys.userId, userId));

      if (existing) {
        throw new ConflictException(
          'Public key already registered. Use PUT to rotate.',
        );
      }

      const [key] = await tx
        .insert(userKeys)
        .values({
          userId,
          publicKey: dto.publicKey,
          keyVersion: 1,
        })
        .returning();

      return key;
    });
  }

  /**
   * Rotate the public key for the current user.
   * Increments the key version.
   */
  async rotatePublicKey(dto: RegisterPublicKeyDto) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [existing] = await tx
        .select()
        .from(userKeys)
        .where(eq(userKeys.userId, userId));

      if (!existing) {
        throw new NotFoundException(
          'No public key registered. Use POST to register first.',
        );
      }

      const [updated] = await tx
        .update(userKeys)
        .set({
          publicKey: dto.publicKey,
          keyVersion: existing.keyVersion + 1,
        })
        .where(eq(userKeys.userId, userId))
        .returning();

      return updated;
    });
  }

  /**
   * Get the current user's public key.
   */
  async getMyPublicKey() {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [key] = await tx
        .select()
        .from(userKeys)
        .where(eq(userKeys.userId, userId));

      if (!key) {
        throw new NotFoundException('No public key registered');
      }

      return key;
    });
  }

  /**
   * Get another user's public key (for key exchange).
   */
  async getUserPublicKey(userId: string) {
    return this.db.rls(async (tx) => {
      const [key] = await tx
        .select()
        .from(userKeys)
        .where(eq(userKeys.userId, userId));

      if (!key) {
        throw new NotFoundException('User has no public key registered');
      }

      return {
        userId: key.userId,
        publicKey: key.publicKey,
        keyVersion: key.keyVersion,
      };
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
          ownerId,
          recipientId: dto.recipientId,
          dekType: dto.dekType,
          encryptedDek: dto.encryptedDek,
          keyVersion: dto.keyVersion,
        })
        .onConflictDoUpdate({
          target: [
            encryptedDeks.ownerId,
            encryptedDeks.recipientId,
            encryptedDeks.dekType,
          ],
          set: {
            encryptedDek: dto.encryptedDek,
            keyVersion: dto.keyVersion,
          },
        })
        .returning();

      return dek;
    });
  }

  /**
   * Get my DEK copy from a specific owner (I am the recipient).
   */
  async getMyEncryptedDek(ownerId: string) {
    const recipientId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [dek] = await tx
        .select()
        .from(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.ownerId, ownerId),
            eq(encryptedDeks.recipientId, recipientId),
          ),
        );

      if (!dek) {
        throw new NotFoundException('No DEK copy found for this owner');
      }

      return dek;
    });
  }

  /**
   * List all DEK copies I own (I am the data owner).
   */
  async getEncryptedDeksForOwner() {
    const ownerId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      return tx
        .select()
        .from(encryptedDeks)
        .where(eq(encryptedDeks.ownerId, ownerId));
    });
  }

  /**
   * Delete a contact's DEK copy (revocation). Owner only.
   */
  async deleteContactDek(recipientId: string) {
    const ownerId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      await tx
        .delete(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.ownerId, ownerId),
            eq(encryptedDeks.recipientId, recipientId),
            eq(encryptedDeks.dekType, 'contact'),
          ),
        );

      return { deleted: true };
    });
  }

  /**
   * Check if a DEK copy exists for a given owner/recipient pair.
   */
  async getDekStatus(ownerId: string, recipientId: string) {
    return this.db.rls(async (tx) => {
      const [dek] = await tx
        .select({ id: encryptedDeks.id, dekType: encryptedDeks.dekType })
        .from(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.ownerId, ownerId),
            eq(encryptedDeks.recipientId, recipientId),
          ),
        );

      return { exists: !!dek, dekType: dek?.dekType ?? null };
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
          ownerId: userId,
          recipientId: userId,
          dekType: 'escrow',
          encryptedDek: encryptedDekBase64,
          keyVersion: 0, // KMS-encrypted, not tied to user key version
        })
        .onConflictDoUpdate({
          target: [
            encryptedDeks.ownerId,
            encryptedDeks.recipientId,
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
      // Find escrow DEK
      const escrowDek = await this.db.rls(async (tx) => {
        const [dek] = await tx
          .select()
          .from(encryptedDeks)
          .where(
            and(
              eq(encryptedDeks.ownerId, userId),
              eq(encryptedDeks.recipientId, userId),
              eq(encryptedDeks.dekType, 'escrow'),
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
