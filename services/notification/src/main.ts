import { NestFactory } from '@nestjs/core';
import { NotificationModule } from './notification/notification.module';
import { AllExceptionsFilter } from './exception.filter';
import * as client from 'prom-client';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import * as jaeger from 'jaeger-client';
import { initTracer } from 'jaeger-client';

// Create a custom Prometheus registry to avoid conflicts
const prometheusRegistry = new client.Registry();

// Initialize Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
try {
  collectDefaultMetrics({ register: prometheusRegistry });
  console.log('Prometheus default metrics initialized');
} catch (error) {
  console.error('Failed to initialize Prometheus default metrics:', error);
}

// Define custom HTTP metrics
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [prometheusRegistry], // Use custom registry
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
  registers: [prometheusRegistry], // Use custom registry
});

// Initialize Jaeger tracer with error handling
let tracer: jaeger.Tracer;
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
  tracer = initTracer(jaegerConfig, jaegerOptions);
  console.log('Jaeger tracer initialized for jaeger:14268');
} catch (error) {
  console.error(
    'Failed to initialize Jaeger tracer, using no-op tracer:',
    error,
  );
  tracer = {
    startSpan: (name) => {
      const tags: { key: string; value: any }[] = [];
      return {
        setTag: (key, value) => {
          tags.push({ key, value });
          return { finish: () => {} };
        },
        finish: () => {
          console.log(
            JSON.stringify({
              span: name,
              tags,
              timestamp: new Date().toISOString(),
            }),
          );
        },
      };
    },
    close: (cb) => cb?.(),
  } as any;
}

async function bootstrap() {
  const expressApp = express();
  const app = await NestFactory.create(
    NotificationModule,
    new ExpressAdapter(expressApp),
  );

  // Structured logging and metrics middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const { method, originalUrl } = req;
    const body = JSON.stringify(req.body);
    const ip =
      (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';

    // Start Jaeger span for the request
    const span = tracer.startSpan(`${method} ${originalUrl}`);
    span.setTag('http.method', method);
    span.setTag('http.url', originalUrl);
    span.setTag('http.ip', ip);

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const status = res.statusCode;
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          method,
          url: originalUrl,
          body,
          ip,
          status,
          duration,
        }),
      );
      httpRequestCounter.inc({ method, path: originalUrl, status });
      httpRequestDuration.observe(
        { method, path: originalUrl, status },
        duration,
      );
      try {
        span.setTag('http.status_code', status);
        span.setTag('http.duration', duration);
        span.finish();
      } catch (error) {
        console.error('Error finishing Jaeger span:', error);
      }
    });

    next();
  });

  // Enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: '*',
  });

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Prometheus metrics endpoint
  expressApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', prometheusRegistry.contentType);
    res.end(await prometheusRegistry.metrics());
  });

  await app.listen(process.env.PORT || 3005, '0.0.0.0', () => {
    console.log(
      `Notification service is running on port ${process.env.PORT || 3005}`,
    );
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    try {
      tracer.close(() => console.log('Jaeger tracer closed'));
      await app.close();
      console.log('Application closed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
}

bootstrap().catch((error) => {
  console.error('Error bootstrapping application:', error);
  process.exit(1);
});
