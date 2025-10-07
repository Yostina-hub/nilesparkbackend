// src/middleware/response.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ResponseMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const originalJson = res.json.bind(res);

    res.json = (data: any) => {
      const response = {
        status: data.status || (res.statusCode >= 400 ? 'error' : 'success'),
        statusCode: res.statusCode,
        message:
          data.message ||
          (res.statusCode >= 400 ? 'An error occurred' : 'Request successful'),
        body: data.body || (data.status ? undefined : data),
        timestamp: new Date().toISOString(),
      };
      return originalJson(response);
    };

    next();
  }
}
