import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../interfaces/response.interface';

@Injectable()
export class ResponseMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const originalJson = res.json.bind(res);
    res.json = (data: any) => {
      if (
        data &&
        typeof data === 'object' &&
        'status' in data &&
        (data.status === 'success' || data.status === 'error')
      ) {
        return originalJson(data);
      }
      const response: ApiResponse = {
        status: 'success',
        statusCode: res.statusCode,
        message: data?.message || 'Request processed successfully',
        body: data,
        timestamp: new Date().toISOString(),
      };
      return originalJson(response);
    };
    next();
  }
}
