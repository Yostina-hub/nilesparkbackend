// services/notification/src/notification.controller.ts
import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  Get,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DlqService } from './dlq.service';
@Controller('internal/notify')
export class NotificationController {
  private expectedKey = process.env.INTERNAL_API_KEY || 'mock-api-key';

  constructor(
    @InjectQueue('notification-queue')
    private readonly notificationQueue: Queue,
    private readonly dlqService: DlqService,
  ) {}

  @Get('dlq/inspect')
  async inspectDlq(@Headers('x-internal-api-key') key: string) {
    return this.dlqService.inspectDlq();
  }

  @Post('dlq/reprocess')
  async reprocessDlq(@Body() body: { jobId: string }) {
    return this.dlqService.reprocess(body.jobId);
  }

  // POST /dlq/reprocess-many { jobIds: [] }
  @Post('dlq/reprocess-many')
  async reprocessManyDlq(@Body() body: { jobIds: string[] }) {
    return this.dlqService.reprocessMany(body.jobIds);
  }
  // POST /dlq/purge { jobIds: [] }
  @Post('dlq/purge')
  async purgeDlq(@Body() body: { jobIds: string[] }) {
    return this.dlqService.purge(body.jobIds);
  }
  // GET /dlq/stats
  @Get('dlq/stats')
  async dlqStats() {
    return this.dlqService.stats();
  }

  // GET /dlq/debug
  @Get('dlq/debug')
  async dlqDebug() {
    return this.dlqService.debug();
  }
  @Post('dlq/debug-add')
  async debugAdd() {
    const payload = {
      to: 'debug@example.com',
      subject: 'debug',
      __dlq: {
        originalJobId: 'debug',
        originalQueue: 'notification-queue',
        jobName: 'email',
        attemptsMade: 3,
        failedReason: 'debug insert',
        failedAt: Date.now(),
      },
    };
    const j = await this.dlqService.debugAdd(payload); // add this in DlqService (below)
    return j;
  }

  @Post('dlq/reprocess-all')
  async reprocessAllDlq() {
    return this.dlqService.reprocessAll();
  }

  @Post('email')
  async emailSend(
    @Body() body: { to: string; subject: string; html?: string; text?: string },
  ) {
    const job = await this.notificationQueue.add('email', body, {
      attempts: 3, // Retry up to 3 times
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
    return { jobId: job.id };
  }

  @Post('sms')
  async smsSend(@Body() body: { to: string; text: string }) {
    const job = await this.notificationQueue.add('sms', body, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
    return { jobId: job.id };
  }
}
