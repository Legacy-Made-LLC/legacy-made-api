import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { EncryptionService } from './encryption.service';
import { DeviceLinkingService } from './device-linking.service';
import {
  RegisterPublicKeyDto,
  StoreEncryptedDekDto,
  EnableEscrowDto,
  InitiateRecoveryDto,
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

  @Post('keys')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 10, ttl: 60000 },
  })
  registerPublicKey(@Body() dto: RegisterPublicKeyDto) {
    return this.encryptionService.registerPublicKey(dto);
  }

  @Put('keys')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 10, ttl: 60000 },
  })
  rotatePublicKey(@Body() dto: RegisterPublicKeyDto) {
    return this.encryptionService.rotatePublicKey(dto);
  }

  @Get('keys/me')
  getMyPublicKey() {
    return this.encryptionService.getMyPublicKey();
  }

  @Get('keys/:userId')
  getUserPublicKey(@Param('userId') userId: string) {
    return this.encryptionService.getUserPublicKey(userId);
  }

  // =========================================================================
  // Encrypted DEKs
  // =========================================================================

  @Post('deks')
  storeEncryptedDek(@Body() dto: StoreEncryptedDekDto) {
    return this.encryptionService.storeEncryptedDek(dto);
  }

  @Get('deks/mine/:ownerId')
  getMyEncryptedDek(@Param('ownerId') ownerId: string) {
    return this.encryptionService.getMyEncryptedDek(ownerId);
  }

  @Get('deks')
  getEncryptedDeksForOwner() {
    return this.encryptionService.getEncryptedDeksForOwner();
  }

  @Delete('deks/:recipientId')
  deleteContactDek(@Param('recipientId') recipientId: string) {
    return this.encryptionService.deleteContactDek(recipientId);
  }

  @Get('deks/status/:ownerId/:recipientId')
  getDekStatus(
    @Param('ownerId') ownerId: string,
    @Param('recipientId') recipientId: string,
  ) {
    return this.encryptionService.getDekStatus(ownerId, recipientId);
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

  @Post('recovery')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    short: { limit: 1, ttl: 10000 },
    medium: { limit: 3, ttl: 60000 },
  })
  initiateRecovery(@Body() dto: InitiateRecoveryDto, @Req() req: Request) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip ??
      'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.encryptionService.initiateRecovery(dto, ipAddress, userAgent);
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
