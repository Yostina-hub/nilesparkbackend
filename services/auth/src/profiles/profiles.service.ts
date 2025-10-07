// src/profiles/profiles.service.ts
import { Injectable, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService) {}

  async createProfile(userId: string, data: { bio?: string; avatar?: string }) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }
      const existingProfile = await this.prisma.profile.findUnique({
        where: { userId },
      });
      if (existingProfile) {
        throw new Error('User already has a profile');
      }

      const profile = await this.prisma.profile.create({
        data: {
          bio: data.bio,
          avatar: data.avatar,
          user: { connect: { id: userId } },
        },
      });
      return {
        body: profile,
        message: 'Profile created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: error.message || 'Failed to create profile',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async getProfile(userId: string) {
    try {
      const profile = await this.prisma.profile.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              userRoles: {
                include: {
                  role: {
                    select: {
                      id: true,
                      name: true,
                      type: true,
                      organizationId: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      console.log('profile', profile);
      if (profile) {
        console.log(profile);
      }
      if (!profile) {
        // Create a dummy profile if none exists
        return await this.createProfile(userId, { bio: '', avatar: '' });
      }

      return {
        body: {
          ...profile,
          user: {
            ...profile.user,
            roles: profile.user.userRoles.map((ur) => ({
              id: ur.role.id,
              name: ur.role.name,
              type: ur.role.type,
              organizationId: ur.role.organizationId ?? undefined,
            })),
          },
        },
        message: 'Profile retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 404,
          message: error.message || 'Profile not found',
          timestamp: new Date().toISOString(),
        },
        404,
      );
    }
  }
  async updateProfile(
    userId: string,
    data: { bio?: string; avatar?: string },
    requesterId: string,
  ) {
    try {
      if (userId !== requesterId) {
        throw new Error('Unauthorized: You can only update your own profile');
      }
      const profile = await this.prisma.profile.findUnique({
        where: { userId },
      });
      if (!profile) {
        throw new Error(
          'Profile not found. You can create a profile using POST /profiles.',
        );
      }

      const updatedProfile = await this.prisma.profile.update({
        where: { userId },
        data: {
          bio: data.bio,
          avatar: data.avatar,
          updatedAt: new Date(),
        },
      });
      return {
        body: updatedProfile,
        message: 'Profile updated successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.message.includes('Unauthorized') ? 403 : 404,
          message: error.message || 'Failed to update profile',
          timestamp: new Date().toISOString(),
        },
        error.message.includes('Unauthorized') ? 403 : 404,
      );
    }
  }
}
