import { Test, TestingModule } from '@nestjs/testing';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

describe('ProgressController', () => {
  let controller: ProgressController;

  const mockProgressService = {
    upsert: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProgressController],
      providers: [
        {
          provide: ProgressService,
          useValue: mockProgressService,
        },
      ],
    }).compile();

    controller = module.get<ProgressController>(ProgressController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('upsert', () => {
    it('should delegate to service with planId, key, and dto', async () => {
      const dto = { data: { step: 1 } };
      const expected = {
        id: 'uuid-1',
        planId: 'plan-1',
        key: 'onboarding',
        ...dto,
      };
      mockProgressService.upsert.mockResolvedValue(expected);

      const result = await controller.upsert('plan-1', 'onboarding', dto);

      expect(result).toEqual(expected);
      expect(mockProgressService.upsert).toHaveBeenCalledWith(
        'plan-1',
        'onboarding',
        dto,
      );
    });
  });

  describe('findAll', () => {
    it('should delegate to service with planId', async () => {
      const expected = [{ id: 'uuid-1', key: 'onboarding', data: {} }];
      mockProgressService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll('plan-1');

      expect(result).toEqual(expected);
      expect(mockProgressService.findAll).toHaveBeenCalledWith('plan-1');
    });
  });

  describe('findOne', () => {
    it('should delegate to service with planId and key', async () => {
      const expected = { id: 'uuid-1', key: 'onboarding', data: {} };
      mockProgressService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('plan-1', 'onboarding');

      expect(result).toEqual(expected);
      expect(mockProgressService.findOne).toHaveBeenCalledWith(
        'plan-1',
        'onboarding',
      );
    });
  });

  describe('remove', () => {
    it('should delegate to service with planId and key', async () => {
      mockProgressService.remove.mockResolvedValue({ deleted: true });

      const result = await controller.remove('plan-1', 'onboarding');

      expect(result).toEqual({ deleted: true });
      expect(mockProgressService.remove).toHaveBeenCalledWith(
        'plan-1',
        'onboarding',
      );
    });
  });
});
