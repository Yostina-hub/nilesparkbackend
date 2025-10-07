// src/users/users.service.ts
import { Injectable, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createUser(data: {
    email: string;
    password: string;
    username: string;
    name?: string;
    roleId?: string;
    organizationId?: string;
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          username: data.username,
          name: data.name,
          userRoles: data.roleId
            ? { create: { roleId: data.roleId } }
            : undefined,
          organizations: data.organizationId
            ? { create: { organizationId: data.organizationId } }
            : undefined,
        },
        include: {
          userRoles: { include: { role: true } },
          organizations: true,
        },
      });
      return {
        body: user,
        message: 'User created successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to create user',
          body: { error: error.message },
        },
        400,
      );
    }
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } }, organizations: true },
    });
    if (!user) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 404,
          message: 'User not found',
        },
        404,
      );
    }
    return {
      body: user,
      message: 'User retrieved successfully',
    };
  }
}
