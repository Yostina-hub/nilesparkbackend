import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const message =
      exception instanceof HttpException
        ? exception.message
        : 'INTERNAL_SERVER_ERROR';

    this.logger.error(`Exception: ${exception.message || exception}`);

    response.status(statusCode).json({
      status: 'error',
      statusCode,
      message,
      body: null,
      timestamp: new Date().toISOString(),
    });
  }
}
