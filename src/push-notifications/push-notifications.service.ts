import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import Expo, {
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushTicket,
} from 'expo-server-sdk';
import { ApiConfigService } from '../config/api-config.service';
import { DbService } from '../db/db.service';
import { ApiClsService } from '../lib/api-cls.service';
import { PreferencesService } from '../preferences/preferences.service';
import { NewPushTicket, pushTickets, pushTokens } from '../schema';
import { RegisterTokenDto } from './dto/register-token.dto';

/** Outcome of one `sendToUser` call. */
export interface PushSendResult {
  /** Push tokens the user had before the send. */
  tokens: number;
  /** Messages Expo accepted (got an `ok` ticket for). */
  accepted: number;
}

/** Outcome of one `processReceipts` run. */
export interface ReceiptRunResult {
  checked: number;
  ok: number;
  errors: number;
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly expo: Expo;

  constructor(
    private readonly db: DbService,
    private readonly cls: ApiClsService,
    private readonly config: ApiConfigService,
    private readonly preferencesService: PreferencesService,
  ) {
    const accessToken = this.config.get('EXPO_ACCESS_TOKEN');
    this.expo = new Expo(accessToken ? { accessToken } : undefined);
  }

  /**
   * Register a push token for the current user, taking it over if another
   * account holds it.
   *
   * - Expo tokens belong to the app install, not the account. After an account
   *   switch on a device, the row can still point at the previous user, since
   *   sign-out unregisters only on a best-effort basis.
   * - Under RLS, the upsert's `ON CONFLICT DO UPDATE` can't touch another
   *   user's row (Postgres 42501), so the signed-in user never got the token.
   *   This one statement runs with RLS bypassed; `userId` comes from the
   *   authenticated session, never the request body.
   * - Also ensures a default preferences row exists so the reminder
   *   scheduler can find users who have registered a device.
   */
  async registerToken(dto: RegisterTokenDto) {
    const userId = this.cls.requireUserId();

    const token = await this.db.bypassRls(async (tx) => {
      const [existing] = await tx
        .select({ userId: pushTokens.userId })
        .from(pushTokens)
        .where(eq(pushTokens.token, dto.token));

      if (existing && existing.userId !== userId) {
        this.logger.log(
          `Reassigning push token from user ${existing.userId} to user ${userId}`,
        );
      }

      const [row] = await tx
        .insert(pushTokens)
        .values({
          userId,
          token: dto.token,
          platform: dto.platform,
        })
        .onConflictDoUpdate({
          target: pushTokens.token,
          set: {
            userId,
            platform: dto.platform,
            updatedAt: new Date(),
          },
        })
        .returning();

      return row;
    });

    // Ensure preferences row exists with defaults (no-op if already present)
    await this.preferencesService.ensurePreferencesExist(userId);

    return token;
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
   *
   * - Tokens Expo rejects outright (malformed, `DeviceNotRegistered`) are
   *   deleted.
   * - Each accepted message's ticket is stored in `push_tickets`, so
   *   `processReceipts` can catch failures Expo reports only later.
   *
   * @returns how many tokens the user had and how many messages Expo accepted;
   *   `accepted: 0` means nothing can have been delivered.
   * @throws when Expo's API call fails (network, auth) or, outside production,
   *   when the user is not on the allowlist.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<PushSendResult> {
    if (
      this.config.get('NODE_ENV') !== 'production' &&
      !this.config.get('PUSH_NOTIFICATION_ALLOWLIST').includes(userId)
    ) {
      throw new Error(
        `Push notification blocked: user ${userId} not in allowlist (non-production)`,
      );
    }

    const tokens = await this.getTokensForUser(userId);

    if (tokens.length === 0) {
      this.logger.debug(`No push tokens found for user ${userId}`);
      return { tokens: 0, accepted: 0 };
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
      await this.removeStaleTokens(invalidTokens);
    }

    if (validTokens.length === 0) {
      this.logger.warn(`No valid Expo push tokens for user ${userId}`);
      return { tokens: tokens.length, accepted: 0 };
    }

    const messages: ExpoPushMessage[] = validTokens.map((t) => ({
      to: t,
      sound: 'default' as const,
      title,
      body,
      data,
    }));

    // Tickets come back in the same order as the messages sent.
    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];
    for (const chunk of chunks) {
      tickets.push(...(await this.expo.sendPushNotificationsAsync(chunk)));
    }

    const staleTokens: string[] = [];
    const acceptedTickets: NewPushTicket[] = [];
    tickets.forEach((ticket, index) => {
      const token = validTokens[index];
      if (ticket.status === 'ok') {
        acceptedTickets.push({ ticketId: ticket.id, userId, token });
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        staleTokens.push(token);
      } else {
        this.logger.error(
          `Expo rejected push for user ${userId}: ${ticket.details?.error ?? 'unknown'} - ${ticket.message}`,
        );
      }
    });

    if (staleTokens.length > 0) {
      this.logger.warn(
        `Removing ${staleTokens.length} stale DeviceNotRegistered token(s) for user ${userId}`,
      );
      await this.removeStaleTokens(staleTokens);
    }

    if (acceptedTickets.length > 0) {
      await this.db.bypassRls(async (tx) => {
        await tx.insert(pushTickets).values(acceptedTickets);
      });
      this.logger.log(
        `Expo accepted ${acceptedTickets.length} of ${messages.length} push message(s) for user ${userId}`,
      );
    }

    return { tokens: tokens.length, accepted: acceptedTickets.length };
  }

  /**
   * Fetch Expo receipts for stored tickets and act on them.
   *
   * 1. Load tickets old enough for a receipt (Expo suggests ~15 minutes).
   * 2. Fetch receipts in Expo-sized chunks.
   * 3. Delete tokens whose receipt says `DeviceNotRegistered`; log every
   *    other error, loudly for credential problems that affect every user.
   * 4. Delete tickets that got a receipt, plus any older than Expo's 24-hour
   *    receipt retention.
   *
   * @returns counts for logging and tests.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async processReceipts(): Promise<ReceiptRunResult> {
    const result: ReceiptRunResult = { checked: 0, ok: 0, errors: 0 };

    const tickets = await this.db.bypassRls(async (tx) =>
      tx
        .select()
        .from(pushTickets)
        .where(lte(pushTickets.createdAt, sql`NOW() - INTERVAL '15 minutes'`)),
    );

    const ticketsById = new Map(tickets.map((t) => [t.ticketId, t]));
    const doneTicketIds: string[] = [];
    const staleTokens: string[] = [];

    for (const chunk of this.expo.chunkPushNotificationReceiptIds([
      ...ticketsById.keys(),
    ])) {
      let receipts: Record<string, ExpoPushReceipt>;
      try {
        receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
      } catch (error) {
        this.logger.error('Failed to fetch Expo push receipts', error);
        continue;
      }

      for (const [ticketId, receipt] of Object.entries(receipts)) {
        const ticket = ticketsById.get(ticketId);
        if (!ticket) continue;
        result.checked++;
        doneTicketIds.push(ticketId);

        if (receipt.status === 'ok') {
          result.ok++;
          continue;
        }

        result.errors++;
        const errorCode = receipt.details?.error ?? 'unknown';
        if (errorCode === 'DeviceNotRegistered') {
          staleTokens.push(ticket.token);
        } else if (errorCode === 'InvalidCredentials') {
          this.logger.error(
            `PUSH CREDENTIALS BROKEN: Expo receipt InvalidCredentials for user ${ticket.userId} - ${receipt.message}`,
          );
        } else {
          this.logger.error(
            `Push delivery failed for user ${ticket.userId}: ${errorCode} - ${receipt.message}`,
          );
        }
      }
    }

    if (staleTokens.length > 0) {
      this.logger.warn(
        `Removing ${staleTokens.length} DeviceNotRegistered token(s) reported in receipts`,
      );
      await this.removeStaleTokens(staleTokens);
    }

    await this.db.bypassRls(async (tx) => {
      if (doneTicketIds.length > 0) {
        await tx
          .delete(pushTickets)
          .where(inArray(pushTickets.ticketId, doneTicketIds));
      }
      await tx
        .delete(pushTickets)
        .where(lte(pushTickets.createdAt, sql`NOW() - INTERVAL '24 hours'`));
    });

    if (result.checked > 0) {
      this.logger.log(
        `Push receipts checked: ${result.checked} (${result.ok} ok, ${result.errors} errors)`,
      );
    }

    return result;
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
