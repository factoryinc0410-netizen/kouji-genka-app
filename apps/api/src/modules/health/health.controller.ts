import type { Result } from '@kgk/types';
import { Controller, Get } from '@nestjs/common';

type HealthPayload = { status: 'ok'; service: string; timestamp: string };

@Controller('healthz')
export class HealthController {
  @Get()
  check(): Result<HealthPayload> {
    return {
      ok: true,
      value: {
        status: 'ok',
        service: 'kgk-api',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
