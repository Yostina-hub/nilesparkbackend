// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './auth/exception.filter';
import { ResponseMiddleware } from './middleware/response.middleware';
import * as client from 'prom-client';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import * as jaeger from 'jaeger-client';
import { initTracer } from 'jaeger-client';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Initialize Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
});

// Initialize Jaeger tracer
let tracer: jaeger.Tracer;
const jaegerConfig: jaeger.TracerConfig = {
  serviceName: 'auth-service',
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
  console.log('Jaeger tracer initialized');
} catch (error) {
  console.error(
    'Failed to initialize Jaeger tracer, using no-op tracer:',
    error,
  );
  tracer = {
    startSpan: (name) => ({
      setTag: (key, value) => ({
        finish: () => {
          console.log(
            JSON.stringify({
              span: name,
              tags: { key, value },
              timestamp: new Date().toISOString(),
            }),
          );
        },
      }),
      finish: () => {},
    }),
    close: (cb) => cb?.(),
  } as any;
}

async function bootstrap() {
  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );
  const configService = app.get(ConfigService);

  app.use(new ResponseMiddleware().use);

  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const start = Date.now();
      const { method, originalUrl } = req;
      const ip =
        (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
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
            body: JSON.stringify(req.body),
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
    },
  );

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: '*',
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe());

  expressApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  });

  await app.listen(
    configService.get('PUBLIC_API_PORT') || 3001,
    '0.0.0.0',
    () => {
      console.log(
        `Auth service is running on port ${
          configService.get('PUBLIC_API_PORT') || 3001
        }`,
      );
    },
  );

  process.on('SIGTERM', () => {
    console.log('Shutting down Jaeger tracer...');
    try {
      tracer.close(() => {
        console.log('Jaeger tracer closed');
        process.exit(0);
      });
    } catch (error) {
      console.error('Error closing Jaeger tracer:', error);
      process.exit(0);
    }
  });
}

bootstrap().catch((error) => {
  console.error('Error bootstrapping application:', error);
  process.exit(1);
});
