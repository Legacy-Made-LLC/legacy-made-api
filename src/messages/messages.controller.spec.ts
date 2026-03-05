import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementsGuard, EntitlementsService } from '../entitlements';
import { PlanAccessGuard } from '../plan-access/plan-access.guard';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

describe('MessagesController', () => {
  let controller: MessagesController;

  const mockMessagesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockEntitlementsService = {
    canAccessPillar: jest.fn().mockResolvedValue({ allowed: true }),
    canViewPillar: jest.fn().mockResolvedValue({ allowed: true }),
    canUseQuota: jest.fn().mockResolvedValue({ allowed: true }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        {
          provide: MessagesService,
          useValue: mockMessagesService,
        },
        {
          provide: EntitlementsService,
          useValue: mockEntitlementsService,
        },
      ],
    })
      .overrideGuard(PlanAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(EntitlementsGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<MessagesController>(MessagesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
