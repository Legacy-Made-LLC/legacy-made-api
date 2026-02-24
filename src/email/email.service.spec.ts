import { Test, TestingModule } from '@nestjs/testing';
import { ApiConfigService } from '../config/api-config.service';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        RESEND_API_KEY: 're_test_key',
        RESEND_FROM_EMAIL: 'test@example.com',
        RESEND_FROM_NAME: 'Test App',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ApiConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
