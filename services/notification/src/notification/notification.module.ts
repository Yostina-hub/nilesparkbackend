import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config'; // Add this import
import { NotificationController } from './notification.controller';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { NotificationProcessor } from './notification.processor';
import { DlqService } from './dlq.service';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';
import * as client from 'prom-client';
import * as jaeger from 'jaeger-client';
import { initTracer } from 'jaeger-client';

@Module({
  imports: [
    ConfigModule.forRoot(), // Add this line
    PrometheusModule.register({ path: '/metrics' }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || 'redis://redis-sandbox:6379',
      },
      prefix: 'notif',
    }),
    BullModule.registerQueue(
      {
        name: 'notification-queue',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      },
      { name: 'notification-dlq' },
    ),
  ],
  controllers: [NotificationController],
  providers: [
    EmailService,
    SmsService,
    NotificationProcessor,
    DlqService,
    {
      provide: 'PROMETHEUS_REGISTRY',
      useFactory: () => {
        const registry = new client.Registry();
        try {
          client.collectDefaultMetrics({ register: registry });
          return registry;
        } catch (error) {
          console.error('Failed to initialize Prometheus registry:', error);
          return registry;
        }
      },
    },
    {
      provide: 'JAEGER_TRACER',
      useFactory: () => {
        const jaegerConfig: jaeger.TracerConfig = {
          serviceName: 'notification-sandbox',
          sampler: { type: 'const', param: 1 },
          reporter: {
            collectorEndpoint: 'http://jaeger:14268/api/traces',
            logSpans: true,
          },
        };
        const jaegerOptions: jaeger.TracerOptions = {
          logger: {
            info: (msg) => console.log('Jaeger INFO:', msg),
            warn: (msg) => console.warn('Jaeger WARN:', msg),
            error: (msg) => console.error('Jaeger ERROR:', msg),
            debug: (msg) => console.debug('Jaeger DEBUG:', msg),
          },
        };
        try {
          return initTracer(jaegerConfig, jaegerOptions);
        } catch (error) {
          console.error(
            'Failed to initialize Jaeger tracer, using no-op tracer:',
            error,
          );
          return {
            startSpan: (name) => ({
              setTag: (key, value) => ({
                finish: () =>
                  console.log(
                    JSON.stringify({
                      span: name,
                      key,
                      value,
                      timestamp: new Date().toISOString(),
                    }),
                  ),
              }),
              finish: () => {},
            }),
            close: (cb) => cb?.(),
          } as any;
        }
      },
    },
    makeCounterProvider({
      name: 'notification_jobs_total',
      help: 'Total number of notification jobs processed',
      labelNames: ['job_type', 'status'],
    }),
    makeHistogramProvider({
      name: 'notification_job_duration_seconds',
      help: 'Duration of notification job processing in seconds',
      labelNames: ['job_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    }),
    makeGaugeProvider({
      name: 'notification_dlq_jobs',
      help: 'Number of jobs in the DLQ by state',
      labelNames: ['state'],
    }),
  ],
})
export class NotificationModule {}
