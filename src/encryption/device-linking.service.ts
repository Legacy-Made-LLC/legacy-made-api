import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, and, lt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { deviceLinkingSessions } from '../schema';

@Injectable()
export class DeviceLinkingService {
  private readonly logger = new Logger(DeviceLinkingService.name);

  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
  ) {}

  /**
   * Create a new device linking session.
   * Returns a session code for QR display (expires in 5 minutes).
   */
  async createSession(): Promise<{ sessionCode: string; expiresAt: Date }> {
    const userId = this.cls.requireUserId();
    const sessionCode = randomBytes(16).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.db.rls(async (tx) => {
      await tx.insert(deviceLinkingSessions).values({
        userId,
        sessionCode,
        status: 'pending',
        expiresAt,
      });
    });

    return { sessionCode, expiresAt };
  }

  /**
   * Deposit encrypted payload into a pending session.
   * Called by the source device after the new device scans the QR code.
   *
   * The payload is opaque to the server. In multi-key mode, clients typically
   * exchange device identifiers and public keys rather than raw key material.
   */
  async depositPayload(
    sessionCode: string,
    encryptedPayload: string,
  ): Promise<void> {
    const userId = this.cls.requireUserId();

    await this.db.rls(async (tx) => {
      const [session] = await tx
        .select()
        .from(deviceLinkingSessions)
        .where(
          and(
            eq(deviceLinkingSessions.sessionCode, sessionCode),
            eq(deviceLinkingSessions.userId, userId),
            eq(deviceLinkingSessions.status, 'pending'),
          ),
        );

      if (!session) {
        throw new NotFoundException(
          'Session not found or not in pending state',
        );
      }

      if (session.expiresAt < new Date()) {
        throw new BadRequestException('Session has expired');
      }

      await tx
        .update(deviceLinkingSessions)
        .set({ payload: encryptedPayload, status: 'claimed' })
        .where(eq(deviceLinkingSessions.id, session.id));
    });
  }

  /**
   * Claim a session's payload.
   * Called by the new device to retrieve the encrypted payload.
   *
   * In multi-key mode, the payload typically contains device identifiers
   * and public keys for the new device to register its own key pair.
   */
  async claimSession(sessionCode: string): Promise<{ payload: string }> {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [session] = await tx
        .select()
        .from(deviceLinkingSessions)
        .where(
          and(
            eq(deviceLinkingSessions.sessionCode, sessionCode),
            eq(deviceLinkingSessions.userId, userId),
            eq(deviceLinkingSessions.status, 'claimed'),
          ),
        );

      if (!session) {
        throw new NotFoundException(
          'Session not found or payload not yet deposited',
        );
      }

      if (session.expiresAt < new Date()) {
        throw new BadRequestException('Session has expired');
      }

      if (!session.payload) {
        throw new BadRequestException('No payload available');
      }

      // Mark session as completed
      await tx
        .update(deviceLinkingSessions)
        .set({ status: 'completed' })
        .where(eq(deviceLinkingSessions.id, session.id));

      return { payload: session.payload };
    });
  }

  /**
   * Clean up expired device linking sessions.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredSessions(): Promise<void> {
    try {
      await this.db.bypassRls(async (tx) => {
        await tx
          .delete(deviceLinkingSessions)
          .where(lt(deviceLinkingSessions.expiresAt, new Date()));
      });
      this.logger.log('Cleaned up expired device linking sessions');
    } catch (error) {
      this.logger.error('Failed to clean up expired sessions', error);
    }
  }
}
