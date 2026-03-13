import { Injectable, Logger } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import Expo, { ExpoPushTicket, type ExpoPushMessage } from 'expo-server-sdk';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { ApiConfigService } from '../config/api-config.service';
import { pushTokens } from '../schema';
import { RegisterTokenDto } from './dto/register-token.dto';

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly expo: Expo;

  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
    private readonly config: ApiConfigService,
  ) {
    const accessToken = this.config.get('EXPO_ACCESS_TOKEN');
    this.expo = new Expo(accessToken ? { accessToken } : undefined);
  }

  /**
   * Register or upsert a push token for the current user.
   */
  async registerToken(dto: RegisterTokenDto) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      const [token] = await tx
        .insert(pushTokens)
        .values({
          userId,
          token: dto.token,
          platform: dto.platform,
        })
        .onConflictDoUpdate({
          target: pushTokens.token,
          set: {
            platform: dto.platform,
          },
        })
        .returning();

      return token;
    });
  }

  /**
   * Remove a push token for the current user.
   */
  async unregisterToken(token: string) {
    const userId = this.cls.requireUserId();

    return this.db.rls(async (tx) => {
      await tx
        .delete(pushTokens)
        .where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)));

      return { deleted: true };
    });
  }

  /**
   * Send a push notification to all devices for a given user.
   * Uses bypassRls since the sender may not be the recipient.
   * Errors are logged, not thrown.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    try {
      const tokens = await this.getTokensForUser(userId);

      if (tokens.length === 0) {
        this.logger.debug(`No push tokens found for user ${userId}`);
        return;
      }

      // Filter out invalid tokens and remove them from the DB
      const validTokens: string[] = [];
      const invalidTokens: string[] = [];
      for (const t of tokens) {
        if (Expo.isExpoPushToken(t)) {
          validTokens.push(t);
        } else {
          invalidTokens.push(t);
        }
      }

      if (invalidTokens.length > 0) {
        this.logger.warn(
          `Removing ${invalidTokens.length} invalid push token(s) for user ${userId}`,
        );
        this.removeStaleTokens(invalidTokens).catch((err) =>
          this.logger.error('Failed to remove invalid tokens', err),
        );
      }

      if (validTokens.length === 0) {
        this.logger.warn(`No valid Expo push tokens for user ${userId}`);
        return;
      }

      const messages: ExpoPushMessage[] = validTokens.map((t) => ({
        to: t,
        sound: 'default' as const,
        title,
        body,
        data,
      }));

      const chunks = this.expo.chunkPushNotifications(messages);
      const pushTickets: ExpoPushTicket[] = [];
      for (const chunk of chunks) {
        pushTickets.push(
          ...(await this.expo.sendPushNotificationsAsync(chunk)),
        );
      }

      // Collect tokens that got DeviceNotRegistered errors
      const staleTokens: string[] = [];
      for (let i = 0; i < pushTickets.length; i++) {
        const ticket = pushTickets[i];
        if (
          ticket.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered'
        ) {
          staleTokens.push(validTokens[i]);
        }
      }

      if (staleTokens.length > 0) {
        this.logger.warn(
          `Removing ${staleTokens.length} stale DeviceNotRegistered token(s) for user ${userId}`,
        );
        this.removeStaleTokens(staleTokens).catch((err) =>
          this.logger.error('Failed to remove stale tokens', err),
        );
      }

      const otherErrors = pushTickets.filter(
        (ticket) =>
          ticket.status === 'error' &&
          ticket.details?.error !== 'DeviceNotRegistered',
      );

      if (otherErrors.length > 0) {
        for (const ticket of otherErrors) {
          this.logger.error(
            `Push notification error for user ${userId}`,
            ticket,
          );
        }
      } else {
        this.logger.log(
          `Sent push notification to ${messages.length} device(s) for user ${userId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send push notification to user ${userId}`,
        error,
      );
    }
  }

  /**
   * Look up all push tokens for a user.
   * Uses bypassRls since the sender is typically not the recipient.
   */
  private async getTokensForUser(userId: string): Promise<string[]> {
    const rows = await this.db.bypassRls(async (tx) => {
      return tx
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(eq(pushTokens.userId, userId));
    });

    return rows.map((r) => r.token);
  }

  /**
   * Remove stale or invalid tokens from the database.
   */
  private async removeStaleTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;

    await this.db.bypassRls(async (tx) => {
      await tx.delete(pushTokens).where(inArray(pushTokens.token, tokens));
    });
  }
}
