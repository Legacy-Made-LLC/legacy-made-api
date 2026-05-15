import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { masterSubscriptionAuditLog } from '../schema';
import { MasterSubscriptionsLapseService } from './master-subscriptions-lapse.service';

describe('MasterSubscriptionsLapseService', () => {
  let service: MasterSubscriptionsLapseService;
  let mockDb: { bypassRls: jest.Mock };

  /**
   * Builds a mock tx where:
   *  - .update().set().where().returning() resolves to `lapsedRows`
   *  - .insert().values() captures the audit batch (returned via inserts[])
   */
  const buildMockTx = (lapsedRows: unknown[]) => {
    const inserts: { table: unknown; values: unknown }[] = [];
    let lastInsert: unknown = null;
    const tx: any = {
      update: jest.fn(() => ({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue(lapsedRows),
          }),
        }),
      })),
      insert: jest.fn((tbl: unknown) => {
        lastInsert = tbl;
        return {
          values: jest.fn((vals: unknown) => {
            inserts.push({ table: lastInsert, values: vals });
            return Promise.resolve(undefined);
          }),
        };
      }),
    };
    return { tx, inserts };
  };

  beforeEach(async () => {
    mockDb = { bypassRls: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasterSubscriptionsLapseService,
        { provide: DbService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<MasterSubscriptionsLapseService>(
      MasterSubscriptionsLapseService,
    );
  });

  it('returns [] and writes no audit when nothing has lapsed', async () => {
    const { tx, inserts } = buildMockTx([]);
    mockDb.bypassRls.mockImplementation((cb) => cb(tx));

    const result = await service.lapseExpiredMasterSubs(new Date());

    expect(result).toEqual([]);
    expect(inserts).toHaveLength(0);
  });

  it('flips lapsed master subs and writes a batched audit row per sub', async () => {
    const lapsedRows = [
      {
        id: 'sub_1',
        displayName: 'Acme',
        status: 'past_due',
        currentPeriodEnd: new Date('2026-01-01'),
      },
      {
        id: 'sub_2',
        displayName: 'Beta',
        status: 'past_due',
        currentPeriodEnd: new Date('2025-12-15'),
      },
    ];
    const { tx, inserts } = buildMockTx(lapsedRows);
    mockDb.bypassRls.mockImplementation((cb) => cb(tx));

    const result = await service.lapseExpiredMasterSubs(new Date('2026-05-12'));

    expect(result).toHaveLength(2);
    // Single audit insert call with both rows
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(masterSubscriptionAuditLog);
    const auditRows = inserts[0].values as Record<string, unknown>[];
    expect(auditRows).toHaveLength(2);
    for (const audit of auditRows) {
      expect(audit.action).toBe('lapsed');
      expect(audit.actorUserId).toBeNull();
    }
  });

  it('runDailyLapseCheck swallows errors and logs them (does not crash the schedule)', async () => {
    mockDb.bypassRls.mockRejectedValue(new Error('connection refused'));

    // Should not throw — cron failures must not crash the process
    await expect(service.runDailyLapseCheck()).resolves.toBeUndefined();
  });
});
