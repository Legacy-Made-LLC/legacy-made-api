/**
 * Master Subscriptions — service-layer integration test against a real Postgres.
 *
 * Sequential / stateful: each `it` builds on the prior step's state, mirroring
 * the real admin flow (create → invite → preview → accept → remove → lapse).
 *
 * Gated by `DATABASE_URL_TEST` — when unset, the suite is skipped so default
 * `npm test` and `npm run test:e2e` runs don't fail in environments without
 * a throwaway Postgres branch.
 *
 * Run via:
 *   DATABASE_URL_TEST=postgresql://... npm run test:integration
 */
import { ApiConfigService } from '../src/config/api-config.service';
import { DbService } from '../src/db/db.service';
import { EntitlementsService } from '../src/entitlements/entitlements.service';
import { ApiClsService } from '../src/lib/api-cls.service';
import { MasterSubInvitationTokenService } from '../src/master-subscriptions/master-subscription-invitation-token.service';
import { MasterSubscriptionsLapseService } from '../src/master-subscriptions/master-subscriptions-lapse.service';
import { MasterSubscriptionsService } from '../src/master-subscriptions/master-subscriptions.service';
import {
  masterSubscriptionAuditLog,
  masterSubscriptions,
  users,
} from '../src/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const DB_URL = process.env.DATABASE_URL_TEST;
const describeIfEnv = DB_URL ? describe : describe.skip;

class MutableCls {
  private store: Record<string, unknown> = {};
  set(k: string, v: unknown) {
    this.store[k] = v;
  }
  get(k: string) {
    return this.store[k];
  }
  requireUserId(): string {
    const u = this.store['userId'];
    if (typeof u !== 'string') throw new Error('No userId in test CLS');
    return u;
  }
}

function fakeConfig(): ApiConfigService {
  return {
    get: (key: string) => {
      const m: Record<string, string> = {
        DATABASE_URL_APP: DB_URL!,
        DATABASE_URL_MIGRATIONS: DB_URL!,
        MASTER_SUB_INVITATION_TOKEN_SECRET:
          'test-integration-secret-do-not-use-in-prod',
        INVITATION_BASE_URL: 'https://app.example.com',
      };
      return m[key];
    },
  } as unknown as ApiConfigService;
}

describeIfEnv('MasterSubscriptions integration', () => {
  let pool: Pool;
  let rawDb: ReturnType<typeof drizzle>;
  let masterSubs: MasterSubscriptionsService;
  let tokens: MasterSubInvitationTokenService;
  let entitlements: EntitlementsService;
  let lapse: MasterSubscriptionsLapseService;

  // Shared state across `it` blocks — sequential flow
  let firstSubId: string;
  let inviteToken: string;
  let inviteMemberId: string;
  let secondSubId: string;
  let kateMemberId: string;

  beforeAll(async () => {
    const config = fakeConfig();
    const cls = new MutableCls() as unknown as ApiClsService;
    const db = new DbService(config, cls);
    tokens = new MasterSubInvitationTokenService(config);
    masterSubs = new MasterSubscriptionsService(db, tokens, config);
    entitlements = new EntitlementsService(db, cls);
    lapse = new MasterSubscriptionsLapseService(db);

    pool = new Pool({ connectionString: DB_URL });
    rawDb = drizzle(pool);

    // Reset relevant tables so the suite is idempotent
    await rawDb.execute(
      sql`SELECT set_config('app.bypass_rls_status', 'on', true)`,
    );
    await rawDb.execute(sql`DELETE FROM master_subscription_audit_log`);
    await rawDb.execute(sql`DELETE FROM master_subscription_members`);
    await rawDb.execute(sql`DELETE FROM master_subscriptions`);
    await rawDb.execute(sql`DELETE FROM subscriptions`);
    await rawDb.execute(sql`DELETE FROM users`);

    await rawDb.insert(users).values([
      {
        id: 'user_owner',
        email: 'owner@acme.example',
        firstName: 'Pat',
        lastName: 'Owner',
      },
      {
        id: 'user_admin',
        email: 'admin@gibsonops.example',
        firstName: 'System',
        lastName: 'Admin',
        isSystemAdmin: true,
      },
      {
        id: 'user_jane',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      },
      {
        id: 'user_kate',
        email: 'kate@example.com',
        firstName: 'Kate',
        lastName: 'Doe',
      },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('create master sub', () => {
    it('inserts master sub + owner-implicit-seat + audit row', async () => {
      const created = await masterSubs.create(
        {
          ownerUserId: 'user_owner',
          displayName: 'Acme Estate Planning',
          seatLimit: 3,
          tier: 'individual',
          ownerConsumesSeat: true,
        },
        'user_admin',
      );
      firstSubId = created.id;
      expect(created.id).toBeTruthy();
      expect(created.status).toBe('active');

      const members = await masterSubs.listMembers(created.id);
      expect(
        members.some((m) => m.userId === 'user_owner' && m.status === 'active'),
      ).toBe(true);

      const auditRows = await rawDb
        .select()
        .from(masterSubscriptionAuditLog)
        .where(eq(masterSubscriptionAuditLog.masterSubscriptionId, created.id));
      expect(auditRows.some((r) => r.action === 'created')).toBe(true);
    });
  });

  describe('invite + accept', () => {
    it('inviteMember generates a valid acceptance URL', async () => {
      const invite = await masterSubs.inviteMember(
        firstSubId,
        'JANE@example.com',
        'user_admin',
      );
      inviteToken = invite.token;
      inviteMemberId = invite.memberId;
      expect(invite.acceptanceUrl).toContain('team-invitation?token=');
      expect(invite.invitedEmail).toBe('jane@example.com'); // normalized
    });

    it('previewInvite returns provider + owner + invited email', async () => {
      const preview = await masterSubs.previewInvite(inviteToken);
      expect(preview.providerName).toBe('Acme Estate Planning');
      expect(preview.ownerName).toBe('Pat Owner');
      expect(preview.invitedEmail).toBe('jane@example.com');
      expect(preview.status).toBe('pending_invite');
    });

    it('acceptInvite is NOT email-locked — any signed-in user with the token can accept', async () => {
      // Token email is 'jane@example.com' but we accept as user_jane
      // (who has email 'jane@example.com' in the seed). Token possession
      // is the auth boundary, not email match. See service docstring.
      const accepted = await masterSubs.acceptInvite(inviteToken, 'user_jane');
      expect(accepted.member.status).toBe('active');
      expect(accepted.member.userId).toBe('user_jane');
      expect(accepted.member.id).toBe(inviteMemberId);
    });
  });

  describe('entitlement resolution', () => {
    it("Jane's source is 'b2b' with provider name", async () => {
      const effective = await entitlements.resolveEffectiveTierInTx(
        rawDb as never,
        'user_jane',
      );
      expect(effective.source).toBe('b2b');
      expect(effective.tier).toBe('individual');
      expect(effective.providerName).toBe('Acme Estate Planning');
    });
  });

  describe('invariants', () => {
    it('rejects a duplicate invite for an already-active member', async () => {
      await expect(
        masterSubs.inviteMember(firstSubId, 'jane@example.com', 'user_admin'),
      ).rejects.toThrow(/already has an active or pending invite/);
    });

    it('rejects an invite that would exceed seat_limit', async () => {
      // current: owner + jane = 2 active. seat_limit=3.
      // Add kate (3rd seat) — should succeed.
      await masterSubs.inviteMember(
        firstSubId,
        'kate@example.com',
        'user_admin',
      );
      // 4th invite should overflow.
      await expect(
        masterSubs.inviteMember(firstSubId, 'fifth@example.com', 'user_admin'),
      ).rejects.toThrow(/seats are in use/);
    });

    it('rejects cancelled → active status transition (terminal)', async () => {
      await masterSubs.update(
        firstSubId,
        { status: 'suspended' },
        'user_admin',
      );
      await masterSubs.update(
        firstSubId,
        { status: 'cancelled' },
        'user_admin',
      );
      await expect(
        masterSubs.update(firstSubId, { status: 'active' }, 'user_admin'),
      ).rejects.toThrow(/Invalid status transition/);
    });
  });

  describe('member removal reverts entitlement', () => {
    it('creates a fresh sub for Kate to join via clean state', async () => {
      const fresh = await masterSubs.create(
        {
          ownerUserId: 'user_owner',
          displayName: 'Beta Planning',
          seatLimit: 5,
          tier: 'individual',
          ownerConsumesSeat: false,
        },
        'user_admin',
      );
      secondSubId = fresh.id;
      expect(fresh.id).toBeTruthy();
    });

    it("Kate's source is 'b2b' after accepting", async () => {
      const invite = await masterSubs.inviteMember(
        secondSubId,
        'kate@example.com',
        'user_admin',
      );
      await masterSubs.acceptInvite(invite.token, 'user_kate');
      const before = await entitlements.resolveEffectiveTierInTx(
        rawDb as never,
        'user_kate',
      );
      expect(before.source).toBe('b2b');

      const kateMember = (await masterSubs.listMembers(secondSubId)).find(
        (m) => m.userId === 'user_kate',
      );
      expect(kateMember).toBeDefined();
      kateMemberId = kateMember!.id;
    });

    it("Kate's source reverts to 'none' after removal", async () => {
      await masterSubs.removeMember(kateMemberId, 'user_admin');
      const after = await entitlements.resolveEffectiveTierInTx(
        rawDb as never,
        'user_kate',
      );
      expect(after.source).toBe('none');
    });
  });

  describe('daily lapse cron', () => {
    it('flips active → past_due for subs past current_period_end', async () => {
      // Force secondSubId past expiry
      await rawDb
        .update(masterSubscriptions)
        .set({
          status: 'active',
          currentPeriodEnd: new Date(Date.now() - 1000 * 60 * 60 * 24),
        })
        .where(eq(masterSubscriptions.id, secondSubId));

      const lapsed = await lapse.lapseExpiredMasterSubs(new Date());
      expect(
        lapsed.some((s) => s.id === secondSubId && s.status === 'past_due'),
      ).toBe(true);
    });
  });

  describe('token security', () => {
    it('rejects a JWT signed with the wrong secret', async () => {
      const tampered = jwt.sign(
        {
          masterSubscriptionId: secondSubId,
          memberId: kateMemberId,
          email: 'kate@example.com',
        },
        'wrong-secret',
        {
          issuer: 'legacy-made-api',
          audience: 'legacy-made-master-sub-invitation',
          expiresIn: '7d',
        },
      );
      await expect(masterSubs.previewInvite(tampered)).rejects.toThrow(
        /Invalid invitation/,
      );
    });
  });
});
