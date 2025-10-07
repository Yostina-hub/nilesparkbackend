// src/organizations/organizations.service.ts
import { Injectable, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async createOrganization(data: { name: string; userId: string }) {
    try {
      const organization = await this.prisma.organization.create({
        data: { name: data.name },
      });
      await this.prisma.organizationMember.create({
        data: { userId: data.userId, organizationId: organization.id },
      });
      return {
        body: organization,
        message: 'Organization created successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to create organization',
          body: { error: error.message },
        },
        400,
      );
    }
  }
}
