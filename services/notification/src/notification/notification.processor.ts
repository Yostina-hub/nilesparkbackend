import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { EmailService } from './email.service';
import { SmsService } from './sms.service'; // Add this import
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { Inject } from '@nestjs/common';
import * as jaeger from 'jaeger-client';
import * as client from 'prom-client';

type EmailJobData = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  template?: string;
  data?: Record<string, any>;
  forceFail?: boolean;
  failTimes?: number;
};

type SmsJobData = {
  to: string;
  text: string;
};

@Processor('notification-queue')
@Injectable()
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @InjectQueue('notification-queue')
    private readonly notificationQueue: Queue,
    @InjectQueue('notification-dlq') private readonly dlqQueue: Queue,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService, // Add this injection
    @InjectMetric('notification_jobs_total')
    private readonly jobsCounter: Counter<string>,
    @InjectMetric('notification_job_duration_seconds')
    private readonly jobDuration: Histogram<string>,
    @Inject('JAEGER_TRACER') private readonly tracer: jaeger.Tracer,
    @Inject('PROMETHEUS_REGISTRY')
    private readonly prometheusRegistry: client.Registry,
  ) {
    super();
  }

  async process(
    job: Job<EmailJobData | SmsJobData, any, string>,
  ): Promise<any> {
    const span = this.tracer.startSpan(`process:${job.name}`);
    span.setTag('job.id', job.id);
    span.setTag('job.type', job.name);
    span.setTag('job.attemptsMade', job.attemptsMade);
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);
    const end = this.jobDuration.startTimer({ job_type: job.name });

    try {
      switch (job.name) {
        case 'email':
          await this.handleEmail(job as Job<EmailJobData>);
          this.jobsCounter.inc({ job_type: job.name, status: 'success' });
          span.setTag('job.status', 'success');
          return { ok: true };
        case 'sms':
          await this.handleSms(job as Job<SmsJobData>);
          this.jobsCounter.inc({ job_type: job.name, status: 'success' });
          span.setTag('job.status', 'success');
          return { ok: true };
        default:
          throw new Error(`Unsupported job type: ${job.name}`);
      }
    } catch (err: any) {
      this.jobsCounter.inc({ job_type: job.name, status: 'failed' });
      span.setTag('job.status', 'failed');
      span.setTag('error.message', err.message);
      const attempts = job.opts.attempts ?? 1;
      const attemptNumber = (job.attemptsMade ?? 0) + 1;
      const permanent = this.isPermanentError(err, job);
      const isLastTry = attemptNumber >= attempts;

      this.logger.error(
        `process() caught error on job ${job.id} try ${attemptNumber}/${attempts}; ` +
          `permanent=${permanent} lastTry=${isLastTry}: ${err?.message}`,
      );

      if (permanent || isLastTry) {
        try {
          await this.moveToDlq(job, err);
          await job.remove();
          span.setTag('job.movedToDlq', true);
          return { ok: false, movedToDlq: true };
        } catch (dlqErr: any) {
          this.logger.error(
            `Failed to move job ${job.id} to DLQ: ${dlqErr.message}`,
          );
          span.setTag('job.movedToDlq', false);
          span.setTag('dlq.error', dlqErr.message);
          return { ok: false, movedToDlq: false, error: dlqErr.message };
        }
      }

      throw err;
    } finally {
      end();
      try {
        span.finish();
      } catch (error) {
        this.logger.error('Error finishing Jaeger span:', error);
      }
    }
  }

  private async handleEmail(job: Job<EmailJobData>): Promise<void> {
    const data = job.data ?? {};
    const attemptNumber = job.attemptsMade + 1;

    if (data.forceFail === true) {
      throw new Error('Forced permanent failure for DLQ demo');
    }
    if (typeof data.failTimes === 'number' && attemptNumber <= data.failTimes) {
      throw new Error(
        `Simulated transient failure ${attemptNumber}/${data.failTimes}`,
      );
    }

    await this.emailService.send({
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
      template: data.template,
      data: data.data,
    });
  }

  private async handleSms(job: Job<SmsJobData>): Promise<void> {
    const data = job.data ?? {};
    await this.smsService.send(data.to, data.text);
  }

  private isPermanentError(err: Error, job: Job): boolean {
    const msg = (err?.message || '').toLowerCase();
    if (
      msg.includes('invalid recipient') ||
      msg.includes('invalid address') ||
      msg.includes('hard bounce') ||
      msg.includes('unsupported job type') // Consider unsupported job types as permanent
    ) {
      return true;
    }
    const d = job.data as EmailJobData | SmsJobData | undefined;
    if (!d?.to) return true; // Missing 'to' is permanent
    if (job.name === 'email' && !(d as EmailJobData)?.subject) return true; // Missing 'subject' for email is permanent
    if (
      msg.includes('eai_again') ||
      msg.includes('enotfound') ||
      msg.includes('econnrefused') ||
      msg.includes('timeout')
    ) {
      return false;
    }
    if (msg.includes('rate limit') || msg.includes('429')) {
      return false;
    }
    return false;
  }

  private async moveToDlq(job: Job, err: Error): Promise<void> {
    const payload = {
      ...(job.data ?? {}),
      __dlq: {
        originalJobId: String(job.id),
        originalQueue: job.queueName,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: err?.message ?? 'Unknown error',
        failedAt: Date.now(),
      },
    };

    await this.dlqQueue.waitUntilReady();
    const dlqJob = await this.dlqQueue.add(job.name, payload, {
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 1,
    });

    this.logger.warn(`Moved job ${job.id} → DLQ as ${dlqJob.id}`);
    const counts = await this.dlqQueue.getJobCounts(
      'waiting',
      'failed',
      'completed',
      'active',
      'delayed',
    );
    this.logger.warn(`DLQ counts now: ${JSON.stringify(counts)}`);
  }
}
