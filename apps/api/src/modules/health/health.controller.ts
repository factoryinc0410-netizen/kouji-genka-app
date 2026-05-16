import { Controller, Get } from '@nestjs/common';

@Controller('healthz')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'kgk-api',
      timestamp: new Date().toISOString(),
    };
  }
}
