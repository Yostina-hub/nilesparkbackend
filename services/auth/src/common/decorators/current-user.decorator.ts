import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserSession | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.session as UserSession;
  },
);
