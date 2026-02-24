import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  let service: ProgressService;

  // Separate returning mocks for insert vs delete chains
  const insertReturning = jest.fn();
  const deleteReturning = jest.fn();
  const selectWhere = jest.fn();

  const mockTx = {
    // insert().values().onConflictDoUpdate().returning()
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: insertReturning,
        }),
      }),
    }),
    // select().from().where()
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: selectWhere,
      }),
    }),
    // delete().where().returning()
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: deleteReturning,
      }),
    }),
  };

  const mockDbService = {
    rls: jest.fn((callback) => callback(mockTx)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
    jest.clearAllMocks();
    mockDbService.rls.mockImplementation((callback) => callback(mockTx));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsert', () => {
    it('should upsert a progress record and return it', async () => {
      const expected = {
        id: 'uuid-1',
        planId: 'plan-1',
        key: 'onboarding',
        data: { step: 1 },
      };
      insertReturning.mockResolvedValue([expected]);

      const result = await service.upsert('plan-1', 'onboarding', {
        data: { step: 1 },
      });

      expect(result).toEqual(expected);
      expect(mockTx.insert).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all progress records for a plan', async () => {
      const expected = [
        { id: 'uuid-1', key: 'onboarding', data: {} },
        { id: 'uuid-2', key: 'entries', data: {} },
      ];
      selectWhere.mockResolvedValue(expected);

      const result = await service.findAll('plan-1');

      expect(result).toEqual(expected);
    });
  });

  describe('findOne', () => {
    it('should return a progress record by key', async () => {
      const expected = { id: 'uuid-1', key: 'onboarding', data: { step: 2 } };
      selectWhere.mockResolvedValue([expected]);

      const result = await service.findOne('plan-1', 'onboarding');

      expect(result).toEqual(expected);
    });

    it('should throw NotFoundException when key does not exist', async () => {
      selectWhere.mockResolvedValue([]);

      await expect(service.findOne('plan-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a progress record and return { deleted: true }', async () => {
      deleteReturning.mockResolvedValue([{ id: 'uuid-1' }]);

      const result = await service.remove('plan-1', 'onboarding');

      expect(result).toEqual({ deleted: true });
      expect(mockTx.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when key does not exist', async () => {
      deleteReturning.mockResolvedValue([]);

      await expect(service.remove('plan-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
