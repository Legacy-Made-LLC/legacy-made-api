import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { ApiConfigService } from '../config/api-config.service';
import { DbService, DrizzleTransaction } from '../db/db.service';
import {
  MasterSubscription,
  MasterSubscriptionMember,
  masterSubscriptionAuditLog,
  masterSubscriptionMembers,
  masterSubscriptions,
  users,
} from '../schema';
import { CreateMasterSubscriptionDto } from './dto/create-master-subscription.dto';
import { UpdateMasterSubscriptionDto } from './dto/update-master-subscription.dto';
import { MasterSubInvitationTokenService } from './master-subscription-invitation-token.service';

/**
 * Valid status transitions. `cancelled` is terminal — once a master sub
 * is cancelled it cannot be reactivated (admin would create a new master
 * sub for the same owner instead). `past_due` is reachable both manually
 * and automatically (the daily lapse cron in #26).
 */
const STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  active: ['past_due', 'suspended', 'cancelled'],
  past_due: ['active', 'suspended', 'cancelled'],
  suspended: ['active', 'cancelled'],
  cancelled: [],
};

/** Member statuses that consume a seat against `seat_limit`. */
const SEAT_CONSUMING_STATUSES = ['active', 'pending_invite'] as const;

export type MasterSubscriptionWithMembers = MasterSubscription & {
  members: MasterSubscriptionMember[];
};

export interface InvitationPreview {
  providerName: string;
  ownerName: string | null;
  invitedEmail: string;
  status: 'pending_invite' | 'active' | 'removed';
  masterSubscriptionStatus: string;
}

export interface AcceptInviteResult {
  member: MasterSubscriptionMember;
  masterSubscription: MasterSubscription;
}

@Injectable()
export class MasterSubscriptionsService {
  constructor(
    private readonly db: DbService,
    private readonly tokens: MasterSubInvitationTokenService,
    private readonly config: ApiConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Master subscriptions
  // ---------------------------------------------------------------------------

  async create(
    dto: CreateMasterSubscriptionDto,
    actorUserId: string,
  ): Promise<MasterSubscription> {
    return this.db.bypassRls(async (tx) => {
      // Verify the owner exists. Surface a clearer error than a generic FK
      // violation, since the admin CLI will commonly mistype emails.
      const [owner] = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, dto.ownerUserId));
      if (!owner) {
        throw new NotFoundException(
          `User not found: ${dto.ownerUserId}. Look up the user via the by-email endpoint first.`,
        );
      }

      // If ownerConsumesSeat, we need the owner's email to populate the
      // member row's invited_email (NOT NULL). Reject if missing.
      if (dto.ownerConsumesSeat && !owner.email) {
        throw new BadRequestException(
          'Owner user has no email on file — cannot consume an implicit seat. ' +
            'Either set ownerConsumesSeat=false or backfill the email on the user.',
        );
      }

      const [created] = await tx
        .insert(masterSubscriptions)
        .values({
          ownerUserId: dto.ownerUserId,
          displayName: dto.displayName,
          seatLimit: dto.seatLimit,
          tier: dto.tier,
          ownerConsumesSeat: dto.ownerConsumesSeat,
          currentPeriodEnd: dto.currentPeriodEnd
            ? new Date(dto.currentPeriodEnd)
            : null,
          createdBy: actorUserId,
        })
        .returning();

      if (dto.ownerConsumesSeat) {
        await tx.insert(masterSubscriptionMembers).values({
          masterSubscriptionId: created.id,
          userId: owner.id,
          invitedEmail: owner.email!,
          status: 'active',
          joinedAt: new Date(),
        });
      }

      await this.writeAuditInTx(tx, {
        masterSubscriptionId: created.id,
        actorUserId,
        action: 'created',
        metadata: {
          displayName: dto.displayName,
          tier: dto.tier,
          seatLimit: dto.seatLimit,
          ownerConsumesSeat: dto.ownerConsumesSeat,
        },
      });

      return created;
    });
  }

  async list(): Promise<MasterSubscription[]> {
    return this.db.bypassRls(async (tx) =>
      tx
        .select()
        .from(masterSubscriptions)
        .orderBy(desc(masterSubscriptions.createdAt)),
    );
  }

  async getById(id: string): Promise<MasterSubscriptionWithMembers> {
    return this.db.bypassRls(async (tx) => {
      const [row] = await tx
        .select()
        .from(masterSubscriptions)
        .where(eq(masterSubscriptions.id, id));
      if (!row) {
        throw new NotFoundException(`Master subscription not found: ${id}`);
      }
      const members = await tx
        .select()
        .from(masterSubscriptionMembers)
        .where(eq(masterSubscriptionMembers.masterSubscriptionId, id))
        .orderBy(desc(masterSubscriptionMembers.invitedAt));
      return { ...row, members };
    });
  }

  async update(
    id: string,
    dto: UpdateMasterSubscriptionDto,
    actorUserId: string,
  ): Promise<MasterSubscription> {
    return this.db.bypassRls(async (tx) => {
      const [current] = await tx
        .select()
        .from(masterSubscriptions)
        .where(eq(masterSubscriptions.id, id));
      if (!current) {
        throw new NotFoundException(`Master subscription not found: ${id}`);
      }

      // Validate status transition (if changing)
      if (dto.status && dto.status !== current.status) {
        const allowed = STATUS_TRANSITIONS[current.status] ?? [];
        if (!allowed.includes(dto.status)) {
          throw new UnprocessableEntityException(
            `Invalid status transition: ${current.status} → ${dto.status}`,
          );
        }
      }

      // Validate seat_limit shrink doesn't strand existing members
      if (dto.seatLimit !== undefined && dto.seatLimit < current.seatLimit) {
        const used = await this.countSeatsInTx(tx, id);
        if (dto.seatLimit < used) {
          throw new UnprocessableEntityException(
            `Cannot shrink seat_limit to ${dto.seatLimit}: ${used} active/pending seats are in use. Remove members first.`,
          );
        }
      }

      const updates: Partial<typeof masterSubscriptions.$inferInsert> = {};
      if (dto.displayName !== undefined) updates.displayName = dto.displayName;
      if (dto.seatLimit !== undefined) updates.seatLimit = dto.seatLimit;
      if (dto.status !== undefined) updates.status = dto.status;
      if (dto.currentPeriodEnd !== undefined) {
        updates.currentPeriodEnd = dto.currentPeriodEnd
          ? new Date(dto.currentPeriodEnd)
          : null;
      }
      if (dto.ownerConsumesSeat !== undefined) {
        updates.ownerConsumesSeat = dto.ownerConsumesSeat;
      }

      const [updated] = await tx
        .update(masterSubscriptions)
        .set(updates)
        .where(eq(masterSubscriptions.id, id))
        .returning();

      // Write audit entries for the fields the schema's action enum supports
      if (dto.status !== undefined && dto.status !== current.status) {
        await this.writeAuditInTx(tx, {
          masterSubscriptionId: id,
          actorUserId,
          action: 'status_changed',
          metadata: { from: current.status, to: dto.status },
        });
      }
      if (dto.seatLimit !== undefined && dto.seatLimit !== current.seatLimit) {
        await this.writeAuditInTx(tx, {
          masterSubscriptionId: id,
          actorUserId,
          action: 'seats_changed',
          metadata: { from: current.seatLimit, to: dto.seatLimit },
        });
      }
      if (dto.currentPeriodEnd !== undefined) {
        const fromIso = current.currentPeriodEnd?.toISOString() ?? null;
        const toIso = dto.currentPeriodEnd ?? null;
        if (fromIso !== toIso) {
          await this.writeAuditInTx(tx, {
            masterSubscriptionId: id,
            actorUserId,
            action: 'period_end_changed',
            metadata: { from: fromIso, to: toIso },
          });
        }
      }

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Members
  // ---------------------------------------------------------------------------

  async listMembers(
    masterSubscriptionId: string,
  ): Promise<MasterSubscriptionMember[]> {
    return this.db.bypassRls(async (tx) => {
      // Verify the master sub exists so we 404 instead of returning [] for
      // a non-existent ID (better admin UX).
      const [exists] = await tx
        .select({ id: masterSubscriptions.id })
        .from(masterSubscriptions)
        .where(eq(masterSubscriptions.id, masterSubscriptionId));
      if (!exists) {
        throw new NotFoundException(
          `Master subscription not found: ${masterSubscriptionId}`,
        );
      }
      return tx
        .select()
        .from(masterSubscriptionMembers)
        .where(
          eq(
            masterSubscriptionMembers.masterSubscriptionId,
            masterSubscriptionId,
          ),
        )
        .orderBy(desc(masterSubscriptionMembers.invitedAt));
    });
  }

  async removeMember(
    memberId: string,
    actorUserId: string,
  ): Promise<MasterSubscriptionMember> {
    return this.db.bypassRls(async (tx) => {
      const [member] = await tx
        .select()
        .from(masterSubscriptionMembers)
        .where(eq(masterSubscriptionMembers.id, memberId));
      if (!member) {
        throw new NotFoundException(`Member not found: ${memberId}`);
      }
      if (member.status === 'removed') {
        // Idempotent — surface 409-ish via Bad Request to keep the CLI's
        // mental model simple; the caller can ignore safely.
        throw new BadRequestException('Member is already removed');
      }

      const [updated] = await tx
        .update(masterSubscriptionMembers)
        .set({
          status: 'removed',
          removedAt: new Date(),
          removedBy: actorUserId,
        })
        .where(eq(masterSubscriptionMembers.id, memberId))
        .returning();

      await this.writeAuditInTx(tx, {
        masterSubscriptionId: member.masterSubscriptionId,
        actorUserId,
        action: 'member_removed',
        targetMemberId: memberId,
        metadata: {
          previousStatus: member.status,
          invitedEmail: member.invitedEmail,
        },
      });

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Invitations
  // ---------------------------------------------------------------------------

  /**
   * Admin-side invite generation. Creates a `pending_invite` member row,
   * signs a JWT, returns the acceptance URL. Email-locked: only the email
   * carried in the token can later accept.
   */
  async inviteMember(
    masterSubscriptionId: string,
    email: string,
    actorUserId: string,
  ): Promise<{
    token: string;
    acceptanceUrl: string;
    memberId: string;
    invitedEmail: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new BadRequestException('A valid email is required');
    }

    return this.db.bypassRls(async (tx) => {
      const [sub] = await tx
        .select()
        .from(masterSubscriptions)
        .where(eq(masterSubscriptions.id, masterSubscriptionId));
      if (!sub) {
        throw new NotFoundException(
          `Master subscription not found: ${masterSubscriptionId}`,
        );
      }
      if (sub.status !== 'active') {
        throw new UnprocessableEntityException(
          `Cannot invite to a master subscription with status=${sub.status}. Reactivate first.`,
        );
      }

      // Reject if there's already an active or pending invite for this email
      const [existingActive] = await tx
        .select({ id: masterSubscriptionMembers.id })
        .from(masterSubscriptionMembers)
        .where(
          and(
            eq(
              masterSubscriptionMembers.masterSubscriptionId,
              masterSubscriptionId,
            ),
            eq(masterSubscriptionMembers.invitedEmail, normalizedEmail),
            inArray(
              masterSubscriptionMembers.status,
              SEAT_CONSUMING_STATUSES as unknown as string[],
            ),
          ),
        );
      if (existingActive) {
        throw new ConflictException(
          `${normalizedEmail} already has an active or pending invite. Remove the existing member first to re-invite.`,
        );
      }

      // Seat capacity check including this new invite
      const used = await this.countSeatsInTx(tx, masterSubscriptionId);
      if (used >= sub.seatLimit) {
        throw new UnprocessableEntityException(
          `All ${sub.seatLimit} seats are in use. Free a seat or raise seat_limit first.`,
        );
      }

      const [member] = await tx
        .insert(masterSubscriptionMembers)
        .values({
          masterSubscriptionId,
          invitedEmail: normalizedEmail,
          status: 'pending_invite',
        })
        .returning();

      const token = this.tokens.generateToken({
        masterSubscriptionId,
        memberId: member.id,
        email: normalizedEmail,
      });

      const baseUrl = this.config.get('INVITATION_BASE_URL').replace(/\/$/, '');
      const acceptanceUrl = `${baseUrl}/team-invitation?token=${encodeURIComponent(token)}`;

      await this.writeAuditInTx(tx, {
        masterSubscriptionId,
        actorUserId,
        action: 'invited',
        targetMemberId: member.id,
        metadata: { invitedEmail: normalizedEmail },
      });

      return {
        token,
        acceptanceUrl,
        memberId: member.id,
        invitedEmail: normalizedEmail,
      };
    });
  }

  /**
   * Public preview of an invite token. Does NOT consume the invite. Used
   * by the web fallback page and the in-app preview screen before the
   * user authenticates.
   */
  async previewInvite(token: string): Promise<InvitationPreview> {
    const payload = this.tokens.verifyToken(token);

    return this.db.bypassRls(async (tx) => {
      const [member] = await tx
        .select({
          id: masterSubscriptionMembers.id,
          status: masterSubscriptionMembers.status,
          invitedEmail: masterSubscriptionMembers.invitedEmail,
          masterSubscriptionId: masterSubscriptionMembers.masterSubscriptionId,
        })
        .from(masterSubscriptionMembers)
        .where(eq(masterSubscriptionMembers.id, payload.memberId));

      if (
        !member ||
        member.masterSubscriptionId !== payload.masterSubscriptionId
      ) {
        throw new NotFoundException(
          'This invitation no longer exists. Ask the sender for a fresh invite.',
        );
      }

      const [sub] = await tx
        .select({
          displayName: masterSubscriptions.displayName,
          status: masterSubscriptions.status,
          ownerUserId: masterSubscriptions.ownerUserId,
        })
        .from(masterSubscriptions)
        .where(eq(masterSubscriptions.id, member.masterSubscriptionId));

      if (!sub) {
        throw new NotFoundException(
          'The provider for this invitation is no longer available.',
        );
      }

      const [owner] = await tx
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, sub.ownerUserId));
      const ownerName = owner
        ? [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() ||
          null
        : null;

      return {
        providerName: sub.displayName,
        ownerName,
        invitedEmail: member.invitedEmail,
        status: member.status as 'pending_invite' | 'active' | 'removed',
        masterSubscriptionStatus: sub.status,
      };
    });
  }

  /**
   * Accept an invitation. The token itself is the security boundary —
   * we don't email-lock acceptance, so the recipient can sign in with
   * any account they own (work email got the invite but they prefer
   * a personal account, for example). Mirrors the trusted-contacts
   * pattern (see `access-invitations.service.ts`).
   *
   * Verifies seat capacity at accept time so a slow acceptance can't
   * oversubscribe a sub that's filled up in the meantime.
   */
  async acceptInvite(
    token: string,
    acceptingUserId: string,
  ): Promise<AcceptInviteResult> {
    const payload = this.tokens.verifyToken(token);

    return this.db.bypassRls(async (tx) => {
      const [member] = await tx
        .select()
        .from(masterSubscriptionMembers)
        .where(eq(masterSubscriptionMembers.id, payload.memberId));

      if (
        !member ||
        member.masterSubscriptionId !== payload.masterSubscriptionId
      ) {
        throw new NotFoundException(
          'This invitation no longer exists. Ask the sender for a fresh invite.',
        );
      }

      if (member.status === 'active') {
        throw new ConflictException(
          'This invitation has already been accepted.',
        );
      }
      if (member.status === 'removed') {
        throw new UnprocessableEntityException(
          'This invitation has been revoked. Ask the sender to re-invite.',
        );
      }

      const [sub] = await tx
        .select()
        .from(masterSubscriptions)
        .where(eq(masterSubscriptions.id, member.masterSubscriptionId));
      if (!sub) {
        throw new NotFoundException(
          'The provider for this invitation is no longer available.',
        );
      }
      if (sub.status !== 'active') {
        throw new UnprocessableEntityException(
          `This master subscription is ${sub.status}. Ask the provider to reactivate before accepting.`,
        );
      }
      const now = new Date();
      if (sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
        throw new UnprocessableEntityException(
          'This master subscription has lapsed. Ask the provider for a fresh invite.',
        );
      }

      // Re-check seat capacity at accept time — only count seats other
      // than this pending invite (we're about to flip it to active).
      const [usedRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(masterSubscriptionMembers)
        .where(
          and(
            eq(
              masterSubscriptionMembers.masterSubscriptionId,
              member.masterSubscriptionId,
            ),
            inArray(
              masterSubscriptionMembers.status,
              SEAT_CONSUMING_STATUSES as unknown as string[],
            ),
            sql`${masterSubscriptionMembers.id} != ${payload.memberId}`,
          ),
        );
      const otherSeats = usedRow?.count ?? 0;
      if (otherSeats + 1 > sub.seatLimit) {
        throw new ConflictException(
          `All ${sub.seatLimit} seats are taken. Ask the provider to free a seat or expand the plan.`,
        );
      }

      const [updated] = await tx
        .update(masterSubscriptionMembers)
        .set({
          status: 'active',
          userId: acceptingUserId,
          joinedAt: now,
        })
        .where(eq(masterSubscriptionMembers.id, payload.memberId))
        .returning();

      await this.writeAuditInTx(tx, {
        masterSubscriptionId: member.masterSubscriptionId,
        actorUserId: acceptingUserId,
        action: 'invite_accepted',
        targetMemberId: payload.memberId,
        metadata: { invitedEmail: payload.email },
      });

      return { member: updated, masterSubscription: sub };
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Count seats currently consuming the limit (active + pending_invite).
   * Used to enforce the seat invariant when patching `seat_limit` and
   * when generating new invites (#25).
   */
  async countSeatsInTx(
    tx: DrizzleTransaction,
    masterSubscriptionId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(masterSubscriptionMembers)
      .where(
        and(
          eq(
            masterSubscriptionMembers.masterSubscriptionId,
            masterSubscriptionId,
          ),
          inArray(
            masterSubscriptionMembers.status,
            SEAT_CONSUMING_STATUSES as unknown as string[],
          ),
        ),
      );
    return row?.count ?? 0;
  }

  private async writeAuditInTx(
    tx: DrizzleTransaction,
    entry: {
      masterSubscriptionId: string;
      actorUserId: string | null;
      action: string;
      targetMemberId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.insert(masterSubscriptionAuditLog).values({
      masterSubscriptionId: entry.masterSubscriptionId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetMemberId: entry.targetMemberId ?? null,
      metadata: entry.metadata ?? {},
    });
  }
}
