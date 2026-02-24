import { Test, TestingModule } from '@nestjs/testing';
import { SharedPlansController } from './shared-plans.controller';
import { SharedPlansService } from './shared-plans.service';

describe('SharedPlansController', () => {
  let controller: SharedPlansController;

  const mockSharedPlansService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SharedPlansController],
      providers: [
        {
          provide: SharedPlansService,
          useValue: mockSharedPlansService,
        },
      ],
    }).compile();

    controller = module.get<SharedPlansController>(SharedPlansController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
