import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { createClient } from 'redis';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly redisClient: ReturnType<typeof createClient>;
  private readonly smsProvider: string;

  constructor(private readonly config: ConfigService) {
    // Initialize MailHog SMTP transporter
    this.transporter = nodemailer.createTransport({
      host: this.config
        .get('MAILHOG_SMTP', 'smtp://mailhog-sandbox:1025')
        .split('://')[1]
        .split(':')[0],
      port: parseInt(
        this.config
          .get('MAILHOG_SMTP', 'smtp://mailhog-sandbox:1025')
          .split(':')
          .pop() || '1025',
        10,
      ),
      secure: false,
    });

    // Initialize Redis client
    this.redisClient = createClient({
      url: this.config.get('REDIS_URL', 'redis://redis-sandbox:6379'),
    });
    this.redisClient.connect().catch((err) => {
      this.logger.error(`Failed to connect to Redis: ${err.message}`);
    });

    // SMS provider configuration
    this.smsProvider = this.config.get('SMS_PROVIDER', 'console');
  }

  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    try {
      const cacheKey = `email:${to}:${subject}`;
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        this.logger.log(`Email already sent to ${to} for subject: ${subject}`);
        return;
      }

      await this.transporter.sendMail({
        from: 'no-reply@example.com',
        to,
        subject,
        text,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);

      // Cache the email to prevent duplicates
      await this.redisClient.setEx(cacheKey, 3600, 'sent');
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      throw err;
    }
  }

  async sendSMS(to: string, message: string): Promise<void> {
    try {
      const cacheKey = `sms:${to}:${message}`;
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        this.logger.log(`SMS already sent to ${to}: ${message}`);
        return;
      }

      if (this.smsProvider === 'console') {
        this.logger.log(`SMS to ${to}: ${message}`);
      } else {
        this.logger.warn(`No SMS provider configured for ${to}: ${message}`);
      }

      // Cache the SMS to prevent duplicates
      await this.redisClient.setEx(cacheKey, 3600, 'sent');
    } catch (err) {
      this.logger.error(`Failed to send SMS to ${to}: ${err.message}`);
      throw err;
    }
  }
}
