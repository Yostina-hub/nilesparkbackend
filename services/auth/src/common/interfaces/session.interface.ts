import { UserSession } from '@thallesp/nestjs-better-auth';

export interface ExtendedUserSession extends UserSession {
  activeOrganizationId?: string | null;
}
