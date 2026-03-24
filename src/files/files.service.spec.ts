import { Test, TestingModule } from '@nestjs/testing';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { FilesService } from './files.service';
import { DbService } from '../db/db.service';
import { ApiConfigService } from '../config/api-config.service';
import { R2Service } from './r2.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

describe('FilesService', () => {
  let service: FilesService;
  let mockDbService: any;
  let mockR2Service: any;
  let mockEntitlementsService: any;

  const mockFile = {
    id: 'file-123',
    entryId: 'entry-456',
    wishId: null,
    messageId: null,
    role: 'primary',
    parentFileId: null,
    isEncrypted: false,
    filename: 'test.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storageType: 'r2',
    storageKey: 'entries/entry-456/123-abc.pdf',
    uploadStatus: 'complete',
    accessLevel: 'private',
    shareToken: null,
    shareExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Create fresh mocks for each test
    mockDbService = {
      rls: jest.fn(),
      bypassRls: jest.fn(),
    };

    mockR2Service = {
      createPresignedUploadUrl: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createMultipartUpload: jest.fn(),
      getPartUploadUrls: jest.fn(),
      completeMultipartUpload: jest.fn(),
      deleteObject: jest.fn(),
    };

    mockEntitlementsService = {
      requireFileSizeQuotaInTx: jest.fn().mockResolvedValue(undefined),
      requirePillarAccessInTx: jest.fn().mockResolvedValue(undefined),
      requireViewPillarAccessInTx: jest.fn().mockResolvedValue(undefined),
    };

    const mockApiConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'MULTIPART_THRESHOLD_BYTES') {
          return 100 * 1024 * 1024; // 100MB
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: DbService, useValue: mockDbService },
        { provide: ApiConfigService, useValue: mockApiConfigService },
        { provide: R2Service, useValue: mockR2Service },
        { provide: EntitlementsService, useValue: mockEntitlementsService },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateUpload', () => {
    it('should initiate a simple upload for small files', async () => {
      const dto = {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        role: 'primary',
        isEncrypted: false,
      };

      let selectCallCount = 0;
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // Entry existence check
            return Promise.resolve([{ id: 'entry-123' }]);
          }
          return mockTx;
        }),
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'new-file-id' }]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));
      mockR2Service.createPresignedUploadUrl.mockResolvedValue(
        'https://r2.example.com/upload-url',
      );

      const result = await service.initiateUpload(
        { type: 'entry', id: 'entry-123' },
        dto,
      );

      expect(result.fileId).toBe('new-file-id');
      expect(result.uploadUrl).toBe('https://r2.example.com/upload-url');
      expect(result.uploadMethod).toBe('PUT');
      expect(result.expiresAt).toBeDefined();
      expect(result.uploadId).toBeUndefined();
      expect(result.parts).toBeUndefined();
    });

    it('should initiate a multipart upload for large files', async () => {
      const dto = {
        filename: 'large-file.zip',
        mimeType: 'application/zip',
        sizeBytes: 150 * 1024 * 1024, // 150MB, over the 100MB threshold
        role: 'primary',
        isEncrypted: false,
      };

      let selectCallCount = 0;
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // Entry existence check
            return Promise.resolve([{ id: 'entry-123' }]);
          }
          return mockTx;
        }),
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 'new-file-id' }]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));
      mockR2Service.createMultipartUpload.mockResolvedValue('upload-id-123');
      mockR2Service.getPartUploadUrls.mockResolvedValue([
        { partNumber: 1, uploadUrl: 'https://r2.example.com/part1' },
        { partNumber: 2, uploadUrl: 'https://r2.example.com/part2' },
      ]);

      const result = await service.initiateUpload(
        { type: 'entry', id: 'entry-123' },
        dto,
      );

      expect(result.fileId).toBe('new-file-id');
      expect(result.uploadId).toBe('upload-id-123');
      expect(result.parts).toHaveLength(2);
      expect(result.uploadMethod).toBe('PUT');
      expect(mockR2Service.createMultipartUpload).toHaveBeenCalled();
    });

    it('should throw NotFoundException if entry does not exist', async () => {
      const dto = {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        role: 'primary',
        isEncrypted: false,
      };

      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]), // No entry found
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      await expect(
        service.initiateUpload({ type: 'entry', id: 'nonexistent-entry' }, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeUpload', () => {
    it('should mark a simple upload as complete', async () => {
      let selectCallCount = 0;
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // First call is from findOneInTx
            return Promise.resolve([{ ...mockFile, uploadStatus: 'pending' }]);
          }
          // Subsequent calls are part of the update chain
          return mockTx;
        }),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        returning: jest
          .fn()
          .mockResolvedValue([{ ...mockFile, uploadStatus: 'complete' }]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.completeUpload('file-123', {});

      expect(result.uploadStatus).toBe('complete');
    });

    it('should return existing file if already complete', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockFile]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.completeUpload('file-123', {});

      expect(result.uploadStatus).toBe('complete');
      expect((mockTx as any).update).toBeUndefined(); // Should not attempt update
    });

    it('should complete multipart upload with parts', async () => {
      const pendingFile = { ...mockFile, uploadStatus: 'uploading' };
      let selectCallCount = 0;
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return Promise.resolve([pendingFile]);
          }
          return mockTx;
        }),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        returning: jest
          .fn()
          .mockResolvedValue([{ ...mockFile, uploadStatus: 'complete' }]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));
      mockR2Service.completeMultipartUpload.mockResolvedValue(undefined);

      const parts = [
        { partNumber: 1, etag: 'etag1' },
        { partNumber: 2, etag: 'etag2' },
      ];

      const result = await service.completeUpload('file-123', {
        uploadId: 'upload-id-123',
        parts,
      });

      expect(result.uploadStatus).toBe('complete');
      expect(mockR2Service.completeMultipartUpload).toHaveBeenCalledWith(
        pendingFile.storageKey,
        'upload-id-123',
        parts,
      );
    });

    it('should throw BadRequestException if uploadId missing for multipart', async () => {
      const pendingFile = { ...mockFile, uploadStatus: 'uploading' };
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([pendingFile]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      const parts = [
        { partNumber: 1, etag: 'etag1' },
        { partNumber: 2, etag: 'etag2' },
      ];

      await expect(
        service.completeUpload('file-123', { parts }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a file by ID', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockFile]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.findOne('file-123');

      expect(result.id).toBe('file-123');
    });

    it('should throw NotFoundException if file not found', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllForEntry', () => {
    it('should return all files for an entry', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest
          .fn()
          .mockResolvedValue([mockFile, { ...mockFile, id: 'file-456' }]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.findAllForEntry('entry-456');

      expect(result).toHaveLength(2);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return R2 download URL', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockFile]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));
      mockR2Service.createPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/download',
      );

      const result = await service.getDownloadUrl('file-123');

      expect(result.downloadUrl).toBe('https://r2.example.com/download');
      expect(result.expiresIn).toBe(3600);
    });

    it('should throw BadRequestException if upload not complete', async () => {
      const pendingFile = { ...mockFile, uploadStatus: 'pending' };
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([pendingFile]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      await expect(service.getDownloadUrl('file-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createShareLink', () => {
    it('should create a share link for a completed file', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockFile]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.createShareLink('file-123', {
        expiresInHours: 24,
      });

      expect(result.shareUrl).toMatch(/^\/files\/share\/.+/);
      expect(result.shareToken).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should throw BadRequestException if upload not complete', async () => {
      const pendingFile = { ...mockFile, uploadStatus: 'pending' };
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([pendingFile]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      await expect(
        service.createShareLink('file-123', { expiresInHours: 24 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeShareLink', () => {
    it('should revoke a share link', async () => {
      const sharedFile = {
        ...mockFile,
        shareToken: 'token123',
        shareExpiresAt: new Date(),
      };
      let selectCallCount = 0;
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return Promise.resolve([sharedFile]);
          }
          return mockTx;
        }),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        returning: jest
          .fn()
          .mockResolvedValue([
            { ...sharedFile, shareToken: null, shareExpiresAt: null },
          ]),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.revokeShareLink('file-123');

      expect(result.shareToken).toBeNull();
      expect(result.shareExpiresAt).toBeNull();
    });
  });

  describe('accessSharedFile', () => {
    it('should return download URL for valid share token', async () => {
      const sharedFile = {
        ...mockFile,
        accessLevel: 'shareable',
        shareToken: 'valid-token',
        shareExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([sharedFile]),
      };

      mockDbService.bypassRls.mockImplementation((cb: any) => cb(mockTx));
      mockR2Service.createPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/shared-download',
      );

      const result = await service.accessSharedFile('valid-token');

      expect(result.downloadUrl).toBe('https://r2.example.com/shared-download');
    });

    it('should throw NotFoundException for invalid token', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      mockDbService.bypassRls.mockImplementation((cb: any) => cb(mockTx));

      await expect(service.accessSharedFile('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for expired token', async () => {
      const expiredFile = {
        ...mockFile,
        accessLevel: 'shareable',
        shareToken: 'expired-token',
        shareExpiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      };
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([expiredFile]),
      };

      mockDbService.bypassRls.mockImplementation((cb: any) => cb(mockTx));

      await expect(service.accessSharedFile('expired-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-shareable file', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]), // Query returns empty due to accessLevel check
      };

      mockDbService.bypassRls.mockImplementation((cb: any) => cb(mockTx));

      await expect(
        service.accessSharedFile('token-for-private-file'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete file from R2 and database', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockFile]),
        delete: jest.fn().mockReturnThis(),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));
      mockR2Service.deleteObject.mockResolvedValue(undefined);

      const result = await service.remove('file-123');

      expect(result.deleted).toBe(true);
      expect(mockR2Service.deleteObject).toHaveBeenCalledWith(
        mockFile.storageKey,
      );
    });

    it('should still delete DB record if storage deletion fails', async () => {
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([mockFile]),
        delete: jest.fn().mockReturnThis(),
      };

      mockDbService.rls.mockImplementation((cb: any) => cb(mockTx));
      mockR2Service.deleteObject.mockRejectedValue(new Error('R2 error'));

      // Suppress expected logger.error from the service's error handling
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      // Should not throw, should still return deleted: true
      const result = await service.remove('file-123');

      expect(result.deleted).toBe(true);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to delete file from storage',
        expect.any(Error),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe('toFileResponse', () => {
    it('should return null URLs for pending uploads', async () => {
      const pendingFile = { ...mockFile, uploadStatus: 'pending' };

      const result = await service.toFileResponse(pendingFile);

      expect(result.downloadUrl).toBeNull();
      expect(result.thumbnailUrl).toBeNull();
    });

    it('should return download URL for completed R2 files', async () => {
      mockR2Service.createPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/download',
      );

      const result = await service.toFileResponse(mockFile);

      expect(result.downloadUrl).toBe('https://r2.example.com/download');
    });

    it('should return thumbnail URL for image files', async () => {
      const imageFile = { ...mockFile, mimeType: 'image/jpeg' };
      mockR2Service.createPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/image.jpg',
      );

      const result = await service.toFileResponse(imageFile);

      expect(result.thumbnailUrl).toBe('https://r2.example.com/image.jpg');
    });
  });
});
