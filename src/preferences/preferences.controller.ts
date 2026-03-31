import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { UpdatePreferencesDto, UpdateTimezoneDto } from './dto';
import { PreferencesService } from './preferences.service';

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  getPreferences() {
    return this.preferencesService.getPreferences();
  }

  @Patch()
  updateNotifications(@Body() dto: UpdatePreferencesDto) {
    return this.preferencesService.updateNotifications(dto.notifications);
  }

  @Put('timezone')
  updateTimezone(@Body() dto: UpdateTimezoneDto) {
    return this.preferencesService.upsertTimezone(dto.timezone);
  }
}
