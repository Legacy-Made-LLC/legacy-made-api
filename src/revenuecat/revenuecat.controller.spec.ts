import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
  let recordProcessedEvent: jest.Mock;
  let handleEvent: jest.Mock;

  beforeEach(async () => {
    isEventProcessed = jest.fn().mockResolvedValue(false);
    recordProcessedEvent = jest.fn().mockResolvedValue(undefined);
    handleEvent = jest.fn().mockResolvedValue('handled');

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RevenuecatController],
      providers: [
        {
          provide: RevenuecatService,
          useValue: { isEventProcessed, recordProcessedEvent, handleEvent },
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
      expect(handleEvent).not.toHaveBeenCalled();
    });

    it('rejects requests with a mismatched Authorization header', async () => {
      await expect(
        controller.handleWebhook('wrong-value', makeDto()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(handleEvent).not.toHaveBeenCalled();
    });

    it('accepts requests with the configured Authorization header', async () => {
      await expect(controller.handleWebhook(AUTH, makeDto())).resolves.toEqual({
        received: true,
      });
      expect(handleEvent).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('short-circuits already-processed events', async () => {
      isEventProcessed.mockResolvedValueOnce(true);
      const result = await controller.handleWebhook(AUTH, makeDto());
      expect(result).toEqual({ received: true, deduped: true });
      expect(handleEvent).not.toHaveBeenCalled();
      expect(recordProcessedEvent).not.toHaveBeenCalled();
    });

    it('records outcome after successful dispatch', async () => {
      await controller.handleWebhook(AUTH, makeDto());
      expect(recordProcessedEvent).toHaveBeenCalledWith(
        'evt_1',
        'INITIAL_PURCHASE',
        'handled',
      );
    });

    it('records skipped outcome for event types the service ignores', async () => {
      handleEvent.mockResolvedValueOnce('skipped');
      await controller.handleWebhook(AUTH, makeDto({ type: 'TEST' }));
      expect(recordProcessedEvent).toHaveBeenCalledWith(
        'evt_1',
        'TEST',
        'skipped',
      );
    });
  });

  describe('error handling', () => {
    it('propagates handler errors and does NOT record processing', async () => {
      handleEvent.mockRejectedValueOnce(new Error('downstream failure'));
      await expect(controller.handleWebhook(AUTH, makeDto())).rejects.toThrow(
        'downstream failure',
      );
      expect(recordProcessedEvent).not.toHaveBeenCalled();
    });
  });

  // BadRequestException import kept for symmetry with other webhook specs —
  // DTO validation is handled by the global Zod pipe, not tested here.
  void BadRequestException;
});
