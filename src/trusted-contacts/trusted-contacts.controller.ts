import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateTrustedContactDto } from './dto/create-trusted-contact.dto';
import { UpdateTrustedContactDto } from './dto/update-trusted-contact.dto';
import { TrustedContactsService } from './trusted-contacts.service';

@Controller('plans/:planId/trusted-contacts')
export class TrustedContactsController {
  constructor(
    private readonly trustedContactsService: TrustedContactsService,
  ) {}

  @Post()
  create(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() createTrustedContactDto: CreateTrustedContactDto,
  ) {
    return this.trustedContactsService.create(planId, createTrustedContactDto);
  }

  @Get()
  findAll(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.trustedContactsService.findAll(planId);
  }

  @Get(':id')
  findOne(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trustedContactsService.findOne(id, planId);
  }

  @Patch(':id')
  update(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTrustedContactDto: UpdateTrustedContactDto,
  ) {
    return this.trustedContactsService.update(
      id,
      planId,
      updateTrustedContactDto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trustedContactsService.remove(id, planId);
  }

  @Post(':id/resend-invitation')
  @HttpCode(HttpStatus.NO_CONTENT)
  resendInvitation(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trustedContactsService.resendInvitation(id, planId);
  }
}
