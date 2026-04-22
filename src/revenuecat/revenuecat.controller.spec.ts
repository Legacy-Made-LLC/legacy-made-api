import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiConfigService } from 'src/config/api-config.service';
import { RevenuecatController } from './revenuecat.controller';
import { RevenuecatService } from './revenuecat.service';
import type { RevenuecatWebhookDto } from './dto/webhook.dto';

const AUTH = 'shared-secret-value';

function makeDto(
  overrides: Partial<RevenuecatWebhookDto['event']> = {},
): RevenuecatWebhookDto {
  return {
    api_version: '1.0',
    event: {
      type: 'INITIAL_PURCHASE',
      id: 'evt_1',
      app_user_id: 'user_abc',
      entitlement_ids: ['individual'],
      product_id: 'com.legacymade.individual.monthly',
      ...overrides,
    },
  } as RevenuecatWebhookDto;
}

describe('RevenuecatController', () => {
  let controller: RevenuecatController;
  let isEventProcessed: jest.Mock;
  let processEvent: jest.Mock;

  beforeEach(async () => {
    isEventProcessed = jest.fn().mockResolvedValue(false);
    processEvent = jest.fn().mockResolvedValue('handled');

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 10_000, limit: 30 },
          { name: 'medium', ttl: 60_000, limit: 200 },
        ]),
      ],
      controllers: [RevenuecatController],
      providers: [
        {
          provide: RevenuecatService,
          useValue: { isEventProcessed, processEvent },
        },
        {
          provide: ApiConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'REVENUECAT_WEBHOOK_AUTH_HEADER' ? AUTH : undefined,
            ),
          },
        },
      ],
    }).compile();

    controller = module.get<RevenuecatController>(RevenuecatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('authorization', () => {
    it('rejects requests without an Authorization header', async () => {
      await expect(
        controller.handleWebhook(undefined, makeDto()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(processEvent).not.toHaveBeenCalled();
    });

    it('rejects requests with a mismatched Authorization header', async () => {
      await expect(
        controller.handleWebhook('wrong-value', makeDto()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(processEvent).not.toHaveBeenCalled();
    });

    it('accepts requests with the configured Authorization header', async () => {
      await expect(controller.handleWebhook(AUTH, makeDto())).resolves.toEqual({
        received: true,
      });
      expect(processEvent).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('short-circuits already-processed events', async () => {
      isEventProcessed.mockResolvedValueOnce(true);
      const result = await controller.handleWebhook(AUTH, makeDto());
      expect(result).toEqual({ received: true, deduped: true });
      expect(processEvent).not.toHaveBeenCalled();
    });

    it('dispatches the event and returns received', async () => {
      const result = await controller.handleWebhook(AUTH, makeDto());
      expect(result).toEqual({ received: true });
      expect(processEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'evt_1', type: 'INITIAL_PURCHASE' }),
      );
    });

    it('accepts skipped outcome for event types the service ignores', async () => {
      processEvent.mockResolvedValueOnce('skipped');
      await expect(
        controller.handleWebhook(AUTH, makeDto({ type: 'TEST' })),
      ).resolves.toEqual({ received: true });
    });
  });

  describe('error handling', () => {
    it('propagates handler errors (the tx rolls back dedupe insert)', async () => {
      processEvent.mockRejectedValueOnce(new Error('downstream failure'));
      await expect(controller.handleWebhook(AUTH, makeDto())).rejects.toThrow(
        'downstream failure',
      );
    });
  });

  // BadRequestException import kept for symmetry with other webhook specs —
  // DTO validation is handled by the global Zod pipe, not tested here.
  void BadRequestException;
});
