import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from 'src/auth/auth.guard';
import { DbHealthIndicator } from './db.health';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private dbHealth: DbHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.dbHealth.isHealthy('db')]);
  }
}
