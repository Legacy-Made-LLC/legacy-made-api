import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { EncryptionService } from './encryption.service';
import { DeviceLinkingService } from './device-linking.service';
import {
  RegisterPublicKeyDto,
  StoreEncryptedDekDto,
  RotateDeksDto,
  DeleteDeksQueryDto,
  GetDeksQueryDto,
  EnableEscrowDto,
  InitiateRecoveryDto,
  SetupEncryptionDto,
  DepositPayloadDto,
  ClaimSessionDto,
} from './dto';

@Controller('encryption')
export class EncryptionController {
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly deviceLinkingService: DeviceLinkingService,
  ) {}

  // =========================================================================
  // User Keys
  // =========================================================================

  @Post('setup')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 10, ttl: 60000 },
  })
  setupEncryption(@Body() dto: SetupEncryptionDto) {
    return this.encryptionService.setupEncryption(dto);
  }

  @Post('keys')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 10, ttl: 60000 },
  })
  registerPublicKey(@Body() dto: RegisterPublicKeyDto) {
    return this.encryptionService.registerPublicKey(dto);
  }

  @Delete('keys/:keyVersion')
  deleteKey(@Param('keyVersion', ParseIntPipe) keyVersion: number) {
    return this.encryptionService.deleteKey(keyVersion);
  }

  @Get('keys/me')
  getMyKeys() {
    return this.encryptionService.getMyKeys();
  }

  @Get('keys/:userId')
  getUserKeys(@Param('userId') userId: string) {
    return this.encryptionService.getUserKeys(userId);
  }

  // =========================================================================
  // Encrypted DEKs
  // =========================================================================

  @Post('deks')
  storeEncryptedDek(@Body() dto: StoreEncryptedDekDto) {
    return this.encryptionService.storeEncryptedDek(dto);
  }

  @Put('deks')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 10, ttl: 60000 },
  })
  rotateDeks(@Body() dto: RotateDeksDto) {
    return this.encryptionService.rotateDeks(dto);
  }

  @Delete('deks')
  deleteDeks(@Query() query: DeleteDeksQueryDto) {
    return this.encryptionService.deleteDeks(
      query.planId,
      query.dekType,
      query.recipientId,
      query.keyVersion,
    );
  }

  @Get('deks/mine/:ownerId')
  getMyEncryptedDeks(
    @Param('ownerId') ownerId: string,
    @Query('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.encryptionService.getMyEncryptedDeks(ownerId, planId);
  }

  @Get('deks')
  getEncryptedDeksForOwner(@Query() query: GetDeksQueryDto) {
    return this.encryptionService.getEncryptedDeksForOwner(query.planId);
  }

  @Get('deks/status/:ownerId/:recipientId')
  getDekStatus(
    @Param('ownerId') ownerId: string,
    @Param('recipientId') recipientId: string,
    @Query('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.encryptionService.getDekStatus(ownerId, recipientId, planId);
  }

  // =========================================================================
  // KMS Escrow & Recovery
  // =========================================================================

  @Post('escrow')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 1, ttl: 10000 },
    medium: { limit: 3, ttl: 60000 },
  })
  enableEscrow(@Body() dto: EnableEscrowDto) {
    return this.encryptionService.enableEscrow(dto);
  }

  @Delete('escrow')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 1, ttl: 10000 },
    medium: { limit: 3, ttl: 60000 },
  })
  revokeEscrow(@Query('planId', ParseUUIDPipe) planId: string) {
    return this.encryptionService.revokeEscrow(planId);
  }

  @Post('recovery')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 1, ttl: 10000 },
    medium: { limit: 3, ttl: 60000 },
  })
  initiateRecovery(@Body() dto: InitiateRecoveryDto) {
    return this.encryptionService.initiateRecovery(dto);
  }

  @Get('recovery/events')
  getRecoveryEvents() {
    return this.encryptionService.getRecoveryEvents();
  }

  // =========================================================================
  // Device Linking
  // =========================================================================

  @Post('device-link/session')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 10, ttl: 60000 },
  })
  createDeviceLinkSession() {
    return this.deviceLinkingService.createSession();
  }

  @Post('device-link/deposit')
  depositPayload(@Body() dto: DepositPayloadDto) {
    return this.deviceLinkingService.depositPayload(
      dto.sessionCode,
      dto.encryptedPayload,
    );
  }

  @Post('device-link/claim')
  claimSession(@Body() dto: ClaimSessionDto) {
    return this.deviceLinkingService.claimSession(dto.sessionCode);
  }

  // =========================================================================
  // E2EE Plan Status
  // =========================================================================

  @Post('plans/:planId/enable')
  enableE2ee(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.encryptionService.enableE2ee(planId);
  }

  @Get('plans/:planId/status')
  getE2eeStatus(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.encryptionService.getE2eeStatus(planId);
  }
}
