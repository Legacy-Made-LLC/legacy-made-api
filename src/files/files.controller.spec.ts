import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { MuxService } from './mux.service';

describe('FilesController', () => {
  let controller: FilesController;

  const mockFilesService = {
    initiateUpload: jest.fn(),
    initiateVideoUpload: jest.fn(),
    completeUpload: jest.fn(),
    findAllForEntry: jest.fn(),
    findOne: jest.fn(),
    getDownloadUrl: jest.fn(),
    createShareLink: jest.fn(),
    revokeShareLink: jest.fn(),
    remove: jest.fn(),
    accessSharedFile: jest.fn(),
    handleMuxWebhook: jest.fn(),
  };

  const mockMuxService = {
    getWebhookSecret: jest.fn().mockReturnValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'short', ttl: 1000, limit: 3 },
          { name: 'medium', ttl: 60000, limit: 20 },
        ]),
      ],
      controllers: [FilesController],
      providers: [
        {
          provide: FilesService,
          useValue: mockFilesService,
        },
        {
          provide: MuxService,
          useValue: mockMuxService,
        },
      ],
    }).compile();

    controller = module.get<FilesController>(FilesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
