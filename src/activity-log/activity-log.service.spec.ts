import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { ActivityLogService } from './activity-log.service';

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  const mockCls = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        {
          provide: ClsService,
          useValue: mockCls,
        },
      ],
    }).compile();

    service = module.get<ActivityLogService>(ActivityLogService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should insert a log entry with actor info from CLS', async () => {
    mockCls.get.mockImplementation((key: string) => {
      if (key === 'userId') return 'user-123';
      if (key === 'planAccessRole') return 'owner';
    });

    const mockInsert = jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });
    const tx = { insert: mockInsert } as any;

    await service.log(tx, {
      planId: 'plan-1',
      action: 'created',
      resourceType: 'entry',
      resourceId: 'entry-1',
    });

    expect(mockInsert).toHaveBeenCalled();
  });

  it('should skip logging when no userId in CLS', async () => {
    mockCls.get.mockReturnValue(undefined);

    const mockInsert = jest.fn();
    const tx = { insert: mockInsert } as any;

    await service.log(tx, {
      planId: 'plan-1',
      action: 'created',
      resourceType: 'entry',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('should default actorType to owner when planAccessRole is not set', async () => {
    mockCls.get.mockImplementation((key: string) => {
      if (key === 'userId') return 'user-123';
      return undefined;
    });

    const mockValues = jest.fn().mockResolvedValue(undefined);
    const mockInsert = jest.fn().mockReturnValue({ values: mockValues });
    const tx = { insert: mockInsert } as any;

    await service.log(tx, {
      planId: 'plan-1',
      action: 'updated',
      resourceType: 'wish',
      resourceId: 'wish-1',
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'owner' }),
    );
  });
});
