import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { verifyWebhook, type WebhookEvent } from '@clerk/express/webhooks';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { ApiConfigService } from 'src/config/api-config.service';
import type { UserJSON, UserDeletedJSON } from '@clerk/express';
import { BypassJwtAuth } from 'src/auth/auth.guard';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly config: ApiConfigService,
  ) {}

  @BypassJwtAuth()
  @Post('webhook')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleClerkWebhook(@Req() req: Request) {
    let evt: WebhookEvent;
    try {
      evt = await verifyWebhook(req, {
        signingSecret: this.config.get('SIGNING_SECRET'),
      });
    } catch (err) {
      console.error('Error verifying webhook:', err);
      throw new BadRequestException('Error verifying webhook');
    }

    switch (evt.type) {
      case 'user.created':
        await this.handleUserCreated(evt.data);
        break;
      case 'user.updated':
        await this.handleUserUpdated(evt.data);
        break;
      case 'user.deleted':
        await this.handleUserDeleted(evt.data);
        break;
    }
  }

  private async handleUserCreated(data: UserJSON) {
    await this.usersService.createUser({
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      avatarUrl: data.image_url,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    });
  }

  private async handleUserUpdated(data: UserJSON) {
    await this.usersService.updateUser(data.id, {
      firstName: data.first_name,
      lastName: data.last_name,
      avatarUrl: data.image_url,
      updatedAt: new Date(data.updated_at),
    });
  }

  private async handleUserDeleted(data: UserDeletedJSON) {
    if (data.id === undefined) {
      this.logger.error('User deleted webhook received without ID');
      return;
    }
    await this.usersService.deleteUser(data.id);
  }
}
