import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { DbService } from 'src/db/db.service';
import { ApiClsService } from 'src/lib/api-cls.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: DbService,
          useValue: {
            rls: jest.fn(),
            bypassRls: jest.fn(),
          },
        },
        {
          provide: ApiClsService,
          useValue: {
            requireUserId: jest.fn().mockReturnValue('user_123'),
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
