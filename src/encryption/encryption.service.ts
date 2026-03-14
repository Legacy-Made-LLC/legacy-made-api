import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, sql, desc } from 'drizzle-orm';
import { DbService, DrizzleTransaction } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { EmailService } from '../email/email.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { KmsService } from './kms.service';
import {
  userKeys,
  encryptedDeks,
  keyRecoveryEvents,
  plans,
  users,
  trustedContacts,
  type KeyRecoveryEventType,
} from '../schema';
import {
  RegisterPublicKeyDto,
  StoreEncryptedDekDto,
  RotateDeksDto,
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
    private readonly pushNotifications: PushNotificationsService,
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
      // Verify plan ownership before inserting DEK
      const [plan] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.id, dto.planId));

      if (!plan) {
        throw new NotFoundException('Plan not found');
      }

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
          dekType: 'device',
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

      if (dto.keyType === 'recovery') {
        await tx.insert(keyRecoveryEvents).values({
          userId,
          eventType: 'recovery_key_registered' satisfies KeyRecoveryEventType,
          ipAddress: this.cls.getIpAddress(),
          userAgent: this.cls.getUserAgent(),
          details: { keyVersion: nextVersion, deviceLabel: dto.deviceLabel },
        });
      }

      return key;
    });
  }

  /**
   * Delete a device key by version for the current user.
   * Only device keys can be deleted — recovery keys must be deregistered
   * through the DEK management endpoints (DELETE /encryption/deks/by-type).
   * Also deletes all encrypted DEK copies for this key version in the same transaction.
   */
  async deleteKey(keyVersion: number) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const deleted = await tx
        .delete(userKeys)
        .where(
          and(
            eq(userKeys.userId, userId),
            eq(userKeys.keyVersion, keyVersion),
            eq(userKeys.keyType, 'device'),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        throw new NotFoundException(
          'Device key not found. Only device keys can be deleted via this endpoint.',
        );
      }

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
   * Deactivate a device key by version for the current user.
   * Only device keys can be deactivated. Also deletes associated DEK copies.
   */
  async deactivateKey(keyVersion: number) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [key] = await tx
        .select()
        .from(userKeys)
        .where(
          and(eq(userKeys.userId, userId), eq(userKeys.keyVersion, keyVersion)),
        );

      if (!key) {
        throw new NotFoundException('Key not found');
      }

      if (key.keyType !== 'device') {
        throw new BadRequestException('Only device keys can be deactivated');
      }

      if (!key.isActive) {
        throw new ConflictException('Key is already deactivated');
      }

      const [updated] = await tx
        .update(userKeys)
        .set({ isActive: false, deactivatedAt: new Date() })
        .where(
          and(eq(userKeys.userId, userId), eq(userKeys.keyVersion, keyVersion)),
        )
        .returning();

      await tx
        .delete(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.recipientId, userId),
            eq(encryptedDeks.keyVersion, keyVersion),
          ),
        );

      return updated;
    });
  }

  /**
   * Get all public keys for the current user, ordered by keyVersion.
   */
  async getMyKeys(query?: { active?: boolean }) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const conditions = [eq(userKeys.userId, userId)];

      if (query?.active !== undefined) {
        conditions.push(eq(userKeys.isActive, query.active));
      }

      return tx
        .select()
        .from(userKeys)
        .where(and(...conditions))
        .orderBy(userKeys.keyVersion);
    });
  }

  /**
   * Get another user's public keys (for key exchange).
   * Default: only active keys. Pass includeInactive=true to return all.
   */
  async getUserKeys(userId: string, query?: { includeInactive?: boolean }) {
    return this.db.rls(async (tx) => {
      const conditions = [eq(userKeys.userId, userId)];

      if (!query?.includeInactive) {
        conditions.push(eq(userKeys.isActive, true));
      }

      return tx
        .select({
          userId: userKeys.userId,
          publicKey: userKeys.publicKey,
          keyVersion: userKeys.keyVersion,
          keyType: userKeys.keyType,
          deviceLabel: userKeys.deviceLabel,
          isActive: userKeys.isActive,
          deactivatedAt: userKeys.deactivatedAt,
        })
        .from(userKeys)
        .where(and(...conditions))
        .orderBy(userKeys.keyVersion);
    });
  }

  /**
   * Look up a user's active public keys by email.
   * Used by clients to determine if an invited contact already has an account
   * and to encrypt DEKs for all their active device keys.
   *
   * Mitigations against user enumeration:
   * - Tight rate limits on the controller (5/s, 15/min)
   * - Uniform `{ found: false }` response for both "no account" and "account but no keys"
   * - Requires authentication (no anonymous access)
   */
  async getUserKeysByEmail(email: string) {
    return this.db.bypassRls(async (tx) => {
      const rows = await tx
        .select({
          publicKey: userKeys.publicKey,
          keyVersion: userKeys.keyVersion,
          keyType: userKeys.keyType,
          isActive: userKeys.isActive,
          userId: users.id,
        })
        .from(userKeys)
        .innerJoin(users, eq(userKeys.userId, users.id))
        .where(and(eq(users.email, email), eq(userKeys.isActive, true)))
        .orderBy(desc(userKeys.keyVersion));

      if (rows.length === 0) {
        return { found: false as const };
      }

      return {
        found: true as const,
        userId: rows[0].userId,
        keys: rows.map((r) => ({
          publicKey: r.publicKey,
          keyVersion: r.keyVersion,
          keyType: r.keyType,
          isActive: r.isActive,
        })),
      };
    });
  }

  // =========================================================================
  // Encrypted DEKs
  // =========================================================================

  /**
   * Store an encrypted DEK copy. The owner is the current user.
   * For 'contact' type DEKs, validates that the recipient is a trusted contact on the plan.
   */
  async storeEncryptedDek(dto: StoreEncryptedDekDto) {
    const ownerId = this.cls.requireUserId();

    const dek = await this.db.rls(async (tx) => {
      // Verify plan ownership before inserting DEK
      const [plan] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.id, dto.planId));

      if (!plan) {
        throw new NotFoundException('Plan not found');
      }

      // For contact DEKs, verify the recipient is a trusted contact on this plan
      if (dto.dekType === 'contact' && dto.recipientId !== ownerId) {
        const [contact] = await tx
          .select({ id: trustedContacts.id })
          .from(trustedContacts)
          .where(
            and(
              eq(trustedContacts.planId, dto.planId),
              eq(trustedContacts.clerkUserId, dto.recipientId),
            ),
          )
          .limit(1);

        if (!contact) {
          throw new BadRequestException(
            'Recipient is not a trusted contact on this plan',
          );
        }
      }

      const [result] = await tx
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

      return result;
    });

    // Notify trusted contact when a contact DEK is shared
    if (dto.dekType === 'contact' && dto.recipientId !== ownerId) {
      this.sendDekSharedNotification(
        ownerId,
        dto.recipientId,
        dto.planId,
      ).catch((error) => {
        this.logger.error('Failed to send DEK shared push notification', error);
      });
    }

    return dek;
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
   * Atomic DEK rotation for a plan. Deletes all existing non-escrow DEK copies
   * owned by the current user for the given plan, then inserts the new set.
   * Escrow copies are left untouched (handled separately via /escrow endpoint).
   */
  async rotateDeks(dto: RotateDeksDto) {
    const ownerId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      // Verify plan ownership before rotating DEKs
      const [plan] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.id, dto.planId));

      if (!plan) {
        throw new NotFoundException('Plan not found');
      }

      // Validate that all (recipientId, keyVersion) pairs reference active user keys
      const uniqueKeyPairs = [
        ...new Map(
          dto.newDeks.map((d) => [`${d.recipientId}:${d.keyVersion}`, d]),
        ).values(),
      ];

      for (const dek of uniqueKeyPairs) {
        const [key] = await tx
          .select({ id: userKeys.id })
          .from(userKeys)
          .where(
            and(
              eq(userKeys.userId, dek.recipientId),
              eq(userKeys.keyVersion, dek.keyVersion),
              eq(userKeys.isActive, true),
            ),
          )
          .limit(1);

        if (!key) {
          throw new BadRequestException(
            `No active key found for recipient ${dek.recipientId} at version ${dek.keyVersion}`,
          );
        }
      }

      // Validate contact DEK recipients are trusted contacts on this plan
      const contactRecipientIds = [
        ...new Set(
          dto.newDeks
            .filter((d) => d.dekType === 'contact' && d.recipientId !== ownerId)
            .map((d) => d.recipientId),
        ),
      ];

      for (const recipientId of contactRecipientIds) {
        const [contact] = await tx
          .select({ id: trustedContacts.id })
          .from(trustedContacts)
          .where(
            and(
              eq(trustedContacts.planId, dto.planId),
              eq(trustedContacts.clerkUserId, recipientId),
            ),
          )
          .limit(1);

        if (!contact) {
          throw new BadRequestException(
            `Recipient ${recipientId} is not a trusted contact on this plan`,
          );
        }
      }

      // Delete all existing non-escrow DEK copies for this plan
      await tx
        .delete(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.ownerId, ownerId),
            eq(encryptedDeks.planId, dto.planId),
            sql`${encryptedDeks.dekType} != 'escrow'`,
          ),
        );

      // Insert all new DEK copies
      const inserted = await tx
        .insert(encryptedDeks)
        .values(
          dto.newDeks.map((dek) => ({
            planId: dto.planId,
            ownerId,
            recipientId: dek.recipientId,
            dekType: dek.dekType,
            encryptedDek: dek.encryptedDek,
            keyVersion: dek.keyVersion,
          })),
        )
        .returning();

      // Log recovery events for rotation: deregister old + register new
      const hasRecoveryDeks = dto.newDeks.some(
        (dek) => dek.dekType === 'recovery',
      );
      if (hasRecoveryDeks) {
        const recoveryKeyVersions = dto.newDeks
          .filter((dek) => dek.dekType === 'recovery')
          .map((dek) => dek.keyVersion);

        await tx.insert(keyRecoveryEvents).values([
          {
            userId: ownerId,
            eventType:
              'recovery_key_deregistered' satisfies KeyRecoveryEventType,
            ipAddress: this.cls.getIpAddress(),
            userAgent: this.cls.getUserAgent(),
            details: { planId: dto.planId, reason: 'dek_rotation' },
          },
          {
            userId: ownerId,
            eventType: 'recovery_key_registered' satisfies KeyRecoveryEventType,
            ipAddress: this.cls.getIpAddress(),
            userAgent: this.cls.getUserAgent(),
            details: {
              planId: dto.planId,
              keyVersions: recoveryKeyVersions,
              reason: 'dek_rotation',
            },
          },
        ]);
      }

      return inserted;
    });
  }

  /**
   * Delete encrypted DEK copies by type and plan, optionally filtered by key version.
   * Does not touch the user_keys table.
   */
  async deleteDeks(
    planId: string,
    dekType: string,
    recipientId?: string,
    keyVersion?: number,
  ) {
    const ownerId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const conditions = [
        eq(encryptedDeks.ownerId, ownerId),
        eq(encryptedDeks.planId, planId),
        eq(encryptedDeks.dekType, dekType),
      ];

      if (recipientId) {
        conditions.push(eq(encryptedDeks.recipientId, recipientId));
      }

      if (keyVersion !== undefined) {
        conditions.push(eq(encryptedDeks.keyVersion, keyVersion));
      }

      await tx.delete(encryptedDeks).where(and(...conditions));

      if (dekType === 'recovery') {
        await tx.insert(keyRecoveryEvents).values({
          userId: ownerId,
          eventType: 'recovery_key_deregistered' satisfies KeyRecoveryEventType,
          ipAddress: this.cls.getIpAddress(),
          userAgent: this.cls.getUserAgent(),
          details: { planId, keyVersion },
        });
      }

      return { deleted: true };
    });
  }

  // =========================================================================
  // KMS Escrow
  // =========================================================================

  /**
   * Get the KMS RSA public key for client-side escrow encryption.
   */
  async getEscrowPublicKey() {
    const publicKey = await this.kms.getPublicKey();
    return { publicKey };
  }

  /**
   * Enable KMS escrow by storing the client-encrypted DEK ciphertext.
   * Client encrypts the DEK locally with the KMS RSA public key (RSA-OAEP-SHA256)
   * and sends the ciphertext — the server never sees the plaintext DEK.
   *
   * Verifies the ciphertext is valid by performing a trial KMS decryption before
   * storing. This guarantees the escrow DEK is recoverable, preventing a scenario
   * where the user discovers corrupted escrow data months/years later.
   */
  async enableEscrow(dto: EnableEscrowDto) {
    const userId = this.cls.requireUserId();

    // Verify plan ownership before expensive KMS call
    await this.db.rls(async (tx) => {
      const [plan] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.id, dto.planId));

      if (!plan) {
        throw new NotFoundException('Plan not found');
      }
    });

    // Verify the ciphertext is valid RSA-OAEP by trial-decrypting, then discard
    const encryptedBuffer = Buffer.from(dto.encryptedDek, 'base64');
    const dekPlaintext = await this.kms
      .decryptDek(encryptedBuffer)
      .catch(() => {
        throw new BadRequestException(
          'Invalid escrow ciphertext. Ensure the DEK was encrypted with the KMS public key using RSA-OAEP-SHA256.',
        );
      });
    dekPlaintext.fill(0);

    const result = await this.db.rls(async (tx) => {
      const [dek] = await tx
        .insert(encryptedDeks)
        .values({
          planId: dto.planId,
          ownerId: userId,
          recipientId: userId,
          dekType: 'escrow',
          encryptedDek: dto.encryptedDek,
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
            encryptedDek: dto.encryptedDek,
          },
        })
        .returning();

      return { id: dek.id, enabled: true };
    });

    // Send email notification (fire and forget)
    this.sendEscrowEnabledNotification(userId).catch((error) => {
      this.logger.error('Failed to send escrow enabled notification', error);
    });

    return result;
  }

  /**
   * Revoke KMS escrow for a plan.
   * Deletes the escrow DEK copy and logs an audit event.
   */
  async revokeEscrow(planId: string) {
    const userId = this.cls.requireUserId();

    const result = await this.db.rls(async (tx) => {
      const deleted = await tx
        .delete(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.ownerId, userId),
            eq(encryptedDeks.recipientId, userId),
            eq(encryptedDeks.dekType, 'escrow'),
            eq(encryptedDeks.planId, planId),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        throw new NotFoundException(
          'No escrow DEK found for this plan. Escrow not enabled.',
        );
      }

      await tx.insert(keyRecoveryEvents).values({
        userId,
        eventType: 'escrow_revoked' satisfies KeyRecoveryEventType,
        ipAddress: this.cls.getIpAddress(),
        userAgent: this.cls.getUserAgent(),
        details: { planId },
      });

      return { revoked: true };
    });

    // Send email notification (fire and forget)
    this.sendEscrowRevokedNotification(userId).catch((error) => {
      this.logger.error('Failed to send escrow revoked notification', error);
    });

    return result;
  }

  /**
   * Initiate KMS recovery.
   * Decrypts the escrow DEK via KMS and returns the plaintext over TLS.
   * Logs the event and sends email notification.
   */
  async initiateRecovery(dto: InitiateRecoveryDto) {
    const userId = this.cls.requireUserId();

    try {
      // Single RLS transaction: log initiation, fetch escrow DEK, log completion
      const escrowDek = await this.db.rls(async (tx) => {
        await tx.insert(keyRecoveryEvents).values({
          userId,
          eventType: 'escrow_recovery_initiated' satisfies KeyRecoveryEventType,
          ipAddress: this.cls.getIpAddress(),
          userAgent: this.cls.getUserAgent(),
          details: { newPublicKey: dto.newPublicKey },
        });

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

      // Decrypt via KMS (outside transaction — no DB needed)
      const encryptedBuffer = Buffer.from(escrowDek.encryptedDek, 'base64');
      const dekPlaintext = await this.kms.decryptDek(encryptedBuffer);
      const dekPlaintextBase64 = dekPlaintext.toString('base64');

      // Zero out the buffer after converting to base64
      dekPlaintext.fill(0);

      // Log recovery completion
      await this.db.rls(async (tx) => {
        await tx.insert(keyRecoveryEvents).values({
          userId,
          eventType: 'escrow_recovery_completed' satisfies KeyRecoveryEventType,
          ipAddress: this.cls.getIpAddress(),
          userAgent: this.cls.getUserAgent(),
        });
      });

      // Send email notification (fire and forget)
      this.sendRecoveryNotification(userId).catch((error) => {
        this.logger.error('Failed to send recovery notification', error);
      });

      return { dekPlaintext: dekPlaintextBase64 };
    } catch (error) {
      // Log failure if it's not already a known exception
      if (!(error instanceof NotFoundException)) {
        await this.db.rls(async (tx) => {
          await tx.insert(keyRecoveryEvents).values({
            userId,
            eventType: 'escrow_recovery_failed' satisfies KeyRecoveryEventType,
            ipAddress: this.cls.getIpAddress(),
            userAgent: this.cls.getUserAgent(),
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
  // Shared helpers (used by TrustedContactsService, InvitationActionsService)
  // =========================================================================

  /**
   * Delete contact DEK copies for a given recipient on a plan.
   * Returns true if any rows were deleted.
   *
   * When called with a transaction (e.g. from revoke/delete), the DEK deletion
   * is atomic with the caller's operation. When called without a transaction
   * (e.g. from performDecline where the declining user doesn't own the plan),
   * uses bypassRls for its own connection.
   */
  async deleteContactDekCopy(
    planId: string,
    recipientId: string,
    existingTx?: DrizzleTransaction,
  ): Promise<boolean> {
    const execute = async (tx: DrizzleTransaction) => {
      const [planOwner] = await tx
        .select({ userId: plans.userId })
        .from(plans)
        .where(eq(plans.id, planId));

      if (!planOwner) return [];

      return tx
        .delete(encryptedDeks)
        .where(
          and(
            eq(encryptedDeks.ownerId, planOwner.userId),
            eq(encryptedDeks.recipientId, recipientId),
            eq(encryptedDeks.dekType, 'contact'),
            eq(encryptedDeks.planId, planId),
          ),
        )
        .returning();
    };

    const deleted = existingTx
      ? await execute(existingTx)
      : await this.db.bypassRls(execute);

    return deleted.length > 0;
  }

  /**
   * Resolve a user's clerk ID from their email.
   * Returns null if no user found.
   */
  async resolveUserIdByEmail(email: string): Promise<string | null> {
    const [user] = await this.db.bypassRls(async (tx) => {
      return tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email));
    });

    return user?.id ?? null;
  }

  /**
   * Store contact DEK copies for a trusted contact within an existing transaction.
   * Used by TrustedContactsService.create() for atomic DEK + contact creation.
   */
  async storeContactDekCopies(
    tx: DrizzleTransaction,
    planId: string,
    ownerId: string,
    deks: { recipientId: string; encryptedDek: string; keyVersion: number }[],
  ): Promise<void> {
    for (const dekEntry of deks) {
      await tx
        .insert(encryptedDeks)
        .values({
          planId,
          ownerId,
          recipientId: dekEntry.recipientId,
          dekType: 'contact',
          encryptedDek: dekEntry.encryptedDek,
          keyVersion: dekEntry.keyVersion,
        })
        .onConflictDoUpdate({
          target: [
            encryptedDeks.planId,
            encryptedDeks.ownerId,
            encryptedDeks.recipientId,
            encryptedDeks.keyVersion,
            encryptedDeks.dekType,
          ],
          set: { encryptedDek: dekEntry.encryptedDek },
        });
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async getUserForNotification(
    userId: string,
  ): Promise<{ email: string; firstName: string } | null> {
    const user = await this.db.bypassRls(async (tx) => {
      const [u] = await tx
        .select({
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, userId));
      return u;
    });

    if (!user?.email) {
      this.logger.warn(`Cannot send notification: no email for user ${userId}`);
      return null;
    }

    return { email: user.email, firstName: user.firstName ?? 'there' };
  }

  private async sendDekSharedNotification(
    ownerId: string,
    recipientId: string,
    planId: string,
  ): Promise<void> {
    const owner = await this.getUserForNotification(ownerId);
    const ownerName = owner?.firstName ?? 'Someone';

    await this.pushNotifications.sendToUser(
      recipientId,
      'Plan Access Granted',
      `You now have access to ${ownerName}'s plan.`,
      { type: 'dek_shared', planId },
    );
  }

  private async sendRecoveryNotification(userId: string): Promise<void> {
    const user = await this.getUserForNotification(userId);
    if (!user) return;

    await this.email.sendRecoveryNotification({
      to: user.email,
      firstName: user.firstName,
      ipAddress: this.cls.getIpAddress(),
      userAgent: this.cls.getUserAgent(),
      recoveredAt: new Date(),
    });
  }

  private async sendEscrowEnabledNotification(userId: string): Promise<void> {
    const user = await this.getUserForNotification(userId);
    if (!user) return;

    await this.email.sendEscrowEnabledNotification({
      to: user.email,
      firstName: user.firstName,
      enabledAt: new Date(),
    });
  }

  private async sendEscrowRevokedNotification(userId: string): Promise<void> {
    const user = await this.getUserForNotification(userId);
    if (!user) return;

    await this.email.sendEscrowRevokedNotification({
      to: user.email,
      firstName: user.firstName,
      revokedAt: new Date(),
    });
  }
}
