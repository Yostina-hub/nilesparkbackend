import { Injectable, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';

@Injectable()
export class InvitesService {
  constructor(private prisma: PrismaService) {}

  async createInvite(data: {
    email: string;
    inviterId: string;
    roleId?: string;
    organizationId?: string;
  }) {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    try {
      const invite = await this.prisma.invite.create({
        data: {
          email: data.email,
          token,
          inviterId: data.inviterId,
          roleId: data.roleId,
          organizationId: data.organizationId,
          expiresAt,
        },
      });

      // Send invite email via notification service
      const notificationUrl = 'http://notification:3005/internal/notify/email';
      const internalApiKey = process.env.INTERNAL_API_KEY || 'mock-api-key';
      const emailBody = {
        to: data.email,
        subject: 'Your Invitation to Join',
        text: `You have been invited to join our platform. Please use the following token to sign up: ${invite.token}\n\nSign up here: http://your-app.com/signup?token=${invite.token}`,
      };

      const response = await fetch(notificationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-api-key': internalApiKey,
        },
        body: JSON.stringify(emailBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to send email: ${response.statusText}`);
      }

      return {
        body: { token: invite.token },
        message: 'Invite created and email sent successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to create invite or send email',
          body: { error: error.message },
        },
        400,
      );
    }
  }
}
