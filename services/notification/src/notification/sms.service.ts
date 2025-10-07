import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly redisClient: ReturnType<typeof createClient>;

  constructor(private readonly config: ConfigService) {
    // Initialize Redis client for optional storage
    this.redisClient = createClient({
      url: this.config.get('REDIS_URL', 'redis://redis-sandbox:6379'),
    });
    this.redisClient.connect().catch((err) => {
      this.logger.error(`Failed to connect to Redis: ${err.message}`);
    });
  }

  async send(to: string, text: string) {
    const provider = this.config.get('SMS_PROVIDER', 'console');
    const simulatedId = `sms-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const logData = {
      id: simulatedId,
      to,
      text,
      timestamp: new Date().toISOString(),
      provider: 'console',
    };

    if (provider === 'console') {
      // Structured JSON log for easy parsing
      console.log('[SMS][DEV]', JSON.stringify(logData, null, 2));
      this.logger.log(`SMS simulated: ${JSON.stringify(logData)}`);

      // Optionally store in Redis for inspection (mimics notification.service.ts caching)
      try {
        await this.redisClient.lPush('sms:messages', JSON.stringify(logData));
        await this.redisClient.lTrim('sms:messages', 0, 999); // Keep last 1000 messages
        this.logger.log(`Stored SMS in Redis: ${simulatedId}`);
      } catch (err: any) {
        this.logger.error(`Failed to store SMS in Redis: ${err.message}`);
      }

      return { ok: true, provider: 'console', id: simulatedId };
    }

    // TODO: Add real provider (e.g., Twilio)
    return { ok: false, provider: 'none' };
  }
}
