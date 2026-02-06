import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementsGuard, EntitlementsService } from '../entitlements';
import { WishesController } from './wishes.controller';
import { WishesService } from './wishes.service';

describe('WishesController', () => {
  let controller: WishesController;

  const mockWishesService = {
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
      controllers: [WishesController],
      providers: [
        {
          provide: WishesService,
          useValue: mockWishesService,
        },
        {
          provide: EntitlementsService,
          useValue: mockEntitlementsService,
        },
      ],
    })
      .overrideGuard(EntitlementsGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<WishesController>(WishesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
