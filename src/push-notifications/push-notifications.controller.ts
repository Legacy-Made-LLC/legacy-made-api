import { Body, Controller, Post } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { UnregisterTokenDto } from './dto/unregister-token.dto';

@Controller('push-notifications')
export class PushNotificationsController {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Post('token')
  registerToken(@Body() dto: RegisterTokenDto) {
    return this.pushNotificationsService.registerToken(dto);
  }

  @Post('token/unregister')
  unregisterToken(@Body() dto: UnregisterTokenDto) {
    return this.pushNotificationsService.unregisterToken(dto.token);
  }
}
