import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { TrustedContactsController } from './trusted-contacts.controller';
import { TrustedContactsService } from './trusted-contacts.service';

describe('TrustedContactsController', () => {
  let controller: TrustedContactsController;

  const mockTrustedContactsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    resendInvitation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 1000, limit: 3 },
          { name: 'medium', ttl: 60000, limit: 20 },
        ]),
      ],
      controllers: [TrustedContactsController],
      providers: [
        {
          provide: TrustedContactsService,
          useValue: mockTrustedContactsService,
        },
      ],
    }).compile();

    controller = module.get<TrustedContactsController>(
      TrustedContactsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
