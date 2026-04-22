import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from 'src/db/db.service';
import {
  PROCESSED_EVENTS_RETENTION_MS,
  ProcessedEventsPruneService,
} from './processed-events-prune.service';

describe('ProcessedEventsPruneService', () => {
  let service: ProcessedEventsPruneService;
  let mockDbService: { bypassRls: jest.Mock };
  let whereSpy: jest.Mock;

  beforeEach(async () => {
    whereSpy = jest.fn().mockReturnValue({
      returning: jest
        .fn()
        .mockResolvedValue([{ eventId: 'evt_1' }, { eventId: 'evt_2' }]),
    });
    mockDbService = {
      bypassRls: jest.fn().mockImplementation(async (cb) =>
        cb({
          delete: jest.fn().mockReturnValue({ where: whereSpy }),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessedEventsPruneService,
        { provide: DbService, useValue: mockDbService },
      ],
    }).compile();

    service = module.get(ProcessedEventsPruneService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deleteOlderThan', () => {
    it('returns the count of deleted rows', async () => {
      const cutoff = new Date('2025-01-01');
      const count = await service.deleteOlderThan(cutoff);

      expect(count).toBe(2);
      expect(mockDbService.bypassRls).toHaveBeenCalled();
      expect(whereSpy).toHaveBeenCalled();
    });
  });

  describe('pruneOldEvents', () => {
    it('uses a 90-day cutoff and swallows errors so the cron stays scheduled', async () => {
      mockDbService.bypassRls.mockRejectedValueOnce(new Error('db down'));

      await expect(service.pruneOldEvents()).resolves.toBeUndefined();
    });

    it('exposes 90 days as the retention window', () => {
      expect(PROCESSED_EVENTS_RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000);
    });
  });
});
