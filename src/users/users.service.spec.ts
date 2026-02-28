import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DbService } from 'src/db/db.service';
import { ApiConfigService } from 'src/config/api-config.service';
import { EmailService } from 'src/email/email.service';

describe('UsersService', () => {
  let service: UsersService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DbService,
          useValue: {
            drizzle: {},
          },
        },
        {
          provide: ApiConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EmailService,
          useValue: {
            updateSubscriberProperties: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDefaultSubscription', () => {
    it('should return free when GRANT_LIFETIME_TO_NEW_USERS is false', () => {
      mockConfigService.get.mockReturnValue(false);
      expect(service.getDefaultSubscription()).toBe('free');
    });

    it('should return lifetime when GRANT_LIFETIME_TO_NEW_USERS is true', () => {
      mockConfigService.get.mockReturnValue(true);
      expect(service.getDefaultSubscription()).toBe('lifetime');
    });
  });
});
