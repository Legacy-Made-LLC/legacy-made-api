import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { ApiClsService } from './api-cls.service';

describe('ApiClsService', () => {
  let service: ApiClsService;
  let mockClsService: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    mockClsService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiClsService,
        { provide: ClsService, useValue: mockClsService },
      ],
    }).compile();

    service = module.get<ApiClsService>(ApiClsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should delegate to ClsService', () => {
      mockClsService.get.mockReturnValue('user-123');
      expect(service.get('userId')).toBe('user-123');
      expect(mockClsService.get).toHaveBeenCalledWith('userId');
    });
  });

  describe('set', () => {
    it('should delegate to ClsService', () => {
      service.set('userId', 'user-123');
      expect(mockClsService.set).toHaveBeenCalledWith('userId', 'user-123');
    });
  });

  describe('requireUserId', () => {
    it('should return userId when present', () => {
      mockClsService.get.mockReturnValue('user-123');
      expect(service.requireUserId()).toBe('user-123');
    });

    it('should throw UnauthorizedException when userId is missing', () => {
      mockClsService.get.mockReturnValue(undefined);
      expect(() => service.requireUserId()).toThrow(UnauthorizedException);
    });
  });

  describe('requirePlanAccessRole', () => {
    it('should return role when present', () => {
      mockClsService.get.mockReturnValue('owner');
      expect(service.requirePlanAccessRole()).toBe('owner');
    });

    it('should throw when role is missing', () => {
      mockClsService.get.mockReturnValue(undefined);
      expect(() => service.requirePlanAccessRole()).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('requirePlanAccessLevel', () => {
    it('should return level when present', () => {
      mockClsService.get.mockReturnValue('full_edit');
      expect(service.requirePlanAccessLevel()).toBe('full_edit');
    });

    it('should throw when level is missing', () => {
      mockClsService.get.mockReturnValue(undefined);
      expect(() => service.requirePlanAccessLevel()).toThrow(
        UnauthorizedException,
      );
    });
  });
});
