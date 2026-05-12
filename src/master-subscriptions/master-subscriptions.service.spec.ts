import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import {
  masterSubscriptionAuditLog,
  masterSubscriptionMembers,
  masterSubscriptions,
  users,
} from '../schema';
import { MasterSubscriptionsService } from './master-subscriptions.service';

/**
 * Build a mock tx that:
 *   - Tracks which table was passed to .from() / .insert() / .update() so
 *     each query in a multi-step service method can return distinct data
 *   - Returns supplied fixtures keyed by table
 *
 * The fixture map's keys are the schema table objects; values are the
 * arrays the corresponding query returns.
 */
function makeMockTx(
  opts: {
    select?: Map<unknown, unknown[]>;
    insertReturning?: Map<unknown, unknown[]>;
    updateReturning?: Map<unknown, unknown[]>;
  } = {},
) {
  const selectMap = opts.select ?? new Map();
  const insertMap = opts.insertReturning ?? new Map();
  const updateMap = opts.updateReturning ?? new Map();

  let lastFrom: unknown = null;
  let lastInsert: unknown = null;
  let lastUpdate: unknown = null;

  // Capture mutations so tests can assert what was written
  const inserts: { table: unknown; values: unknown }[] = [];
  const updates: { table: unknown; set: unknown }[] = [];

  const selectChain: any = {
    from: jest.fn((tbl: unknown) => {
      lastFrom = tbl;
      return selectChain;
    }),
    innerJoin: jest.fn(() => selectChain),
    where: jest.fn(() => selectChain),
    orderBy: jest.fn(() => selectChain),
    limit: jest.fn(() => selectChain),
    then: (onF: any, onR: any) =>
      Promise.resolve(selectMap.get(lastFrom) ?? []).then(onF, onR),
    catch: (onR: any) =>
      Promise.resolve(selectMap.get(lastFrom) ?? []).catch(onR),
    finally: (onFinally: any) =>
      Promise.resolve(selectMap.get(lastFrom) ?? []).finally(onFinally),
  };

  const insertChain: any = {
    values: jest.fn((vals: unknown) => {
      inserts.push({ table: lastInsert, values: vals });
      return insertChain;
    }),
    returning: jest.fn(() => Promise.resolve(insertMap.get(lastInsert) ?? [])),
    then: (onF: any, onR: any) =>
      // bare `.insert(x).values(y)` without `.returning()` should await as void
      Promise.resolve(undefined).then(onF, onR),
  };

  const updateChain: any = {
    set: jest.fn((vals: unknown) => {
      updates.push({ table: lastUpdate, set: vals });
      return updateChain;
    }),
    where: jest.fn(() => updateChain),
    returning: jest.fn(() => Promise.resolve(updateMap.get(lastUpdate) ?? [])),
  };

  const tx: any = {
    select: jest.fn(() => selectChain),
    insert: jest.fn((tbl: unknown) => {
      lastInsert = tbl;
      return insertChain;
    }),
    update: jest.fn((tbl: unknown) => {
      lastUpdate = tbl;
      return updateChain;
    }),
  };

  return { tx, inserts, updates };
}

describe('MasterSubscriptionsService', () => {
  let service: MasterSubscriptionsService;
  let mockDb: { bypassRls: jest.Mock; rls: jest.Mock };
  let captured: ReturnType<typeof makeMockTx>;

  const runWith = (opts: Parameters<typeof makeMockTx>[0]) => {
    captured = makeMockTx(opts);
    mockDb.bypassRls.mockImplementation((cb) => cb(captured.tx));
    mockDb.rls.mockImplementation((cb) => cb(captured.tx));
  };

  beforeEach(async () => {
    mockDb = { bypassRls: jest.fn(), rls: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasterSubscriptionsService,
        { provide: DbService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<MasterSubscriptionsService>(
      MasterSubscriptionsService,
    );
  });

  describe('create', () => {
    it('inserts master sub, owner member, and audit log when ownerConsumesSeat=true', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [users, [{ id: 'user_owner', email: 'owner@example.com' }]],
        ]),
        insertReturning: new Map<unknown, unknown[]>([
          [
            masterSubscriptions,
            [{ id: 'master_sub_1', ownerUserId: 'user_owner' }],
          ],
        ]),
      });

      const result = await service.create(
        {
          ownerUserId: 'user_owner',
          displayName: 'Acme Estate Planning',
          seatLimit: 25,
          tier: 'individual',
          ownerConsumesSeat: true,
        },
        'user_admin',
      );

      expect(result.id).toBe('master_sub_1');
      // 3 inserts: master_subscriptions, master_subscription_members (owner seat), audit log
      expect(captured.inserts.map((i) => i.table)).toEqual([
        masterSubscriptions,
        masterSubscriptionMembers,
        masterSubscriptionAuditLog,
      ]);
      const memberInsert = captured.inserts[1].values as Record<
        string,
        unknown
      >;
      expect(memberInsert.userId).toBe('user_owner');
      expect(memberInsert.invitedEmail).toBe('owner@example.com');
      expect(memberInsert.status).toBe('active');
    });

    it('skips owner member insert when ownerConsumesSeat=false', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [users, [{ id: 'user_owner', email: 'owner@example.com' }]],
        ]),
        insertReturning: new Map<unknown, unknown[]>([
          [masterSubscriptions, [{ id: 'master_sub_2' }]],
        ]),
      });

      await service.create(
        {
          ownerUserId: 'user_owner',
          displayName: 'Solo Firm',
          seatLimit: 10,
          tier: 'individual',
          ownerConsumesSeat: false,
        },
        'user_admin',
      );

      expect(captured.inserts.map((i) => i.table)).toEqual([
        masterSubscriptions,
        masterSubscriptionAuditLog,
      ]);
    });

    it('rejects when owner user does not exist', async () => {
      runWith({ select: new Map<unknown, unknown[]>([[users, []]]) });

      await expect(
        service.create(
          {
            ownerUserId: 'ghost',
            displayName: 'x',
            seatLimit: 10,
            tier: 'individual',
            ownerConsumesSeat: true,
          },
          'user_admin',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when owner has no email and ownerConsumesSeat=true', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [users, [{ id: 'user_owner', email: null }]],
        ]),
      });

      await expect(
        service.create(
          {
            ownerUserId: 'user_owner',
            displayName: 'x',
            seatLimit: 10,
            tier: 'individual',
            ownerConsumesSeat: true,
          },
          'user_admin',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('allows status transition active → suspended and writes audit', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [
            masterSubscriptions,
            [
              {
                id: 'master_sub_1',
                status: 'active',
                seatLimit: 25,
                currentPeriodEnd: null,
              },
            ],
          ],
        ]),
        updateReturning: new Map<unknown, unknown[]>([
          [masterSubscriptions, [{ id: 'master_sub_1', status: 'suspended' }]],
        ]),
      });

      const result = await service.update(
        'master_sub_1',
        { status: 'suspended' },
        'user_admin',
      );

      expect(result.status).toBe('suspended');
      // Audit log written once for status_changed
      const auditInserts = captured.inserts.filter(
        (i) => i.table === masterSubscriptionAuditLog,
      );
      expect(auditInserts).toHaveLength(1);
      expect((auditInserts[0].values as Record<string, unknown>).action).toBe(
        'status_changed',
      );
    });

    it('rejects cancelled → active transition (terminal)', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [
            masterSubscriptions,
            [
              {
                id: 'master_sub_1',
                status: 'cancelled',
                seatLimit: 25,
                currentPeriodEnd: null,
              },
            ],
          ],
        ]),
      });

      await expect(
        service.update('master_sub_1', { status: 'active' }, 'user_admin'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects shrinking seat_limit below current usage', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [
            masterSubscriptions,
            [
              {
                id: 'master_sub_1',
                status: 'active',
                seatLimit: 25,
                currentPeriodEnd: null,
              },
            ],
          ],
          [masterSubscriptionMembers, [{ count: 20 }]],
        ]),
      });

      await expect(
        service.update('master_sub_1', { seatLimit: 10 }, 'user_admin'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('allows shrinking seat_limit when it still covers usage', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [
            masterSubscriptions,
            [
              {
                id: 'master_sub_1',
                status: 'active',
                seatLimit: 25,
                currentPeriodEnd: null,
              },
            ],
          ],
          [masterSubscriptionMembers, [{ count: 8 }]],
        ]),
        updateReturning: new Map<unknown, unknown[]>([
          [masterSubscriptions, [{ id: 'master_sub_1', seatLimit: 10 }]],
        ]),
      });

      const result = await service.update(
        'master_sub_1',
        { seatLimit: 10 },
        'user_admin',
      );
      expect(result.seatLimit).toBe(10);
    });

    it('404s when master sub does not exist', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([[masterSubscriptions, []]]),
      });

      await expect(
        service.update('missing', { status: 'suspended' }, 'user_admin'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember', () => {
    it('flips status to removed, sets removedAt/removedBy, writes audit', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [
            masterSubscriptionMembers,
            [
              {
                id: 'member_1',
                masterSubscriptionId: 'master_sub_1',
                status: 'active',
                invitedEmail: 'jane@example.com',
              },
            ],
          ],
        ]),
        updateReturning: new Map<unknown, unknown[]>([
          [masterSubscriptionMembers, [{ id: 'member_1', status: 'removed' }]],
        ]),
      });

      const result = await service.removeMember('member_1', 'user_admin');

      expect(result.status).toBe('removed');
      // Audit log entry written
      const auditInserts = captured.inserts.filter(
        (i) => i.table === masterSubscriptionAuditLog,
      );
      expect(auditInserts).toHaveLength(1);
      const audit = auditInserts[0].values as Record<string, unknown>;
      expect(audit.action).toBe('member_removed');
      expect(audit.targetMemberId).toBe('member_1');
    });

    it('rejects when member is already removed', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [
            masterSubscriptionMembers,
            [
              {
                id: 'member_1',
                masterSubscriptionId: 'master_sub_1',
                status: 'removed',
                invitedEmail: 'jane@example.com',
              },
            ],
          ],
        ]),
      });

      await expect(
        service.removeMember('member_1', 'user_admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s when member does not exist', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([[masterSubscriptionMembers, []]]),
      });

      await expect(
        service.removeMember('missing', 'user_admin'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listMembers', () => {
    it('returns members for an existing master sub', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [masterSubscriptions, [{ id: 'master_sub_1' }]],
          [
            masterSubscriptionMembers,
            [
              { id: 'member_1', status: 'active' },
              { id: 'member_2', status: 'pending_invite' },
            ],
          ],
        ]),
      });

      const result = await service.listMembers('master_sub_1');
      expect(result).toHaveLength(2);
    });

    it('404s when master sub does not exist', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([[masterSubscriptions, []]]),
      });

      await expect(service.listMembers('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getById', () => {
    it('returns the master sub with members attached', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([
          [masterSubscriptions, [{ id: 'master_sub_1', displayName: 'Acme' }]],
          [masterSubscriptionMembers, [{ id: 'member_1', status: 'active' }]],
        ]),
      });

      const result = await service.getById('master_sub_1');
      expect(result.displayName).toBe('Acme');
      expect(result.members).toHaveLength(1);
    });

    it('404s when not found', async () => {
      runWith({
        select: new Map<unknown, unknown[]>([[masterSubscriptions, []]]),
      });

      await expect(service.getById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
