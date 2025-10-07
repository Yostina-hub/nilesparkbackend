import { Injectable, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CodesService {
  constructor(private prisma: PrismaService) {}

  async createCode(data: {
    type: 'ORG' | 'REFERRAL' | 'LINK';
    userId: string;
    organizationId?: string;
  }) {
    try {
      if (!data.userId) {
        console.error('createCode - User ID is undefined');
        throw new Error('User ID is required');
      }

      const code = await this.prisma.code.create({
        data: {
          id: uuidv4(),
          code:
            data.type === 'REFERRAL'
              ? `REF-${uuidv4().slice(0, 8).toUpperCase()}`
              : data.type === 'ORG'
              ? `ORG-${uuidv4().slice(0, 8).toUpperCase()}`
              : `STU-${uuidv4().slice(0, 8).toUpperCase()}`,
          type: data.type,
          userId: data.userId,
          organizationId: data.organizationId,
          expiresAt:
            data.type === 'LINK'
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
              : undefined,
          createdAt: new Date(),
        },
      });
      return {
        body: code,
        message: 'Code created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in createCode:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: error.message || 'Failed to create code',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async validateCode(data: {
    code: string;
    type: 'ORG' | 'REFERRAL' | 'LINK';
  }) {
    try {
      const code = await this.prisma.code.findUnique({
        where: { code: data.code, type: data.type },
      });
      if (!code || (data.type === 'LINK' && code.linkedUserId)) {
        throw new Error('Invalid or already used code');
      }
      if (
        data.type === 'LINK' &&
        code.expiresAt &&
        code.expiresAt < new Date()
      ) {
        throw new Error('Link code has expired');
      }
      return {
        body: code,
        message: 'Code is valid',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in validateCode:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: error.message || 'Failed to validate code',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async addToOrg(data: { code: string; type: 'ORG'; userId: string }) {
    try {
      if (!data.userId) {
        console.error('addToOrg - User ID is undefined');
        throw new Error('User ID is required');
      }

      const code = await this.prisma.code.findUnique({
        where: { code: data.code, type: data.type },
      });
      if (!code || !code.organizationId) {
        throw new Error('Invalid organization code');
      }
      const member = await this.prisma.organizationMember.create({
        data: { userId: data.userId, organizationId: code.organizationId },
      });
      return {
        body: member,
        message: 'User added to organization successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in addToOrg:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: error.message || 'Failed to add user to organization',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async linkDependent(data: { linkCode: string; userId: string }) {
    try {
      if (!data.userId) {
        console.error('linkDependent - User ID is undefined');
        throw new Error('User ID is required');
      }

      const code = await this.prisma.code.findUnique({
        where: { code: data.linkCode, type: 'LINK' },
      });
      if (!code || code.linkedUserId) {
        throw new Error('Invalid or already used link code');
      }
      if (code.expiresAt && code.expiresAt < new Date()) {
        throw new Error('Link code has expired');
      }
      await this.prisma.code.update({
        where: { id: code.id },
        data: { linkedUserId: data.userId },
      });
      return {
        body: { studentId: code.userId },
        message: 'Dependent linked successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in linkDependent:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: error.message || 'Failed to link dependent',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async getStudentProgress(userId: string, linkCode: string) {
    try {
      if (!userId) {
        console.error('getStudentProgress - User ID is undefined');
        throw new Error('User ID is required');
      }
      if (!linkCode) {
        console.error('getStudentProgress - Link code is undefined');
        throw new Error('Link code is required');
      }

      const code = await this.prisma.code.findUnique({
        where: { code: linkCode, type: 'LINK' },
        include: { user: true },
      });
      if (!code || !code.userId) {
        throw new Error('Invalid link code');
      }
      if (code.expiresAt && code.expiresAt < new Date()) {
        throw new Error('Link code has expired');
      }

      const requester = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: { include: { role: true } },
          codes: { where: { code: linkCode, type: 'LINK' } },
        },
      });

      if (!requester) {
        console.error(
          `getStudentProgress - User not found for userId: ${userId}`,
        );
        throw new Error('Requester user not found');
      }

      const isParentOrTeacher = requester.userRoles.some(
        (ur) => ur.role.name === 'PARENT' || ur.role.name === 'TEACHER',
      );
      const isLinkedUser = code.linkedUserId === userId;
      const isCreator = code.createdById === userId;

      if (!isParentOrTeacher && !isLinkedUser && !isCreator) {
        throw new Error(
          'Only parents, teachers, linked users, or account creators can view student progress',
        );
      }

      if (!code.user) {
        throw new Error('Student user not found for this link code');
      }

      const progress = {
        studentId: code.userId,
        email: code.user.email,
        courses: [], // Replace with actual course data
        grades: [], // Replace with actual grade data
      };

      return {
        body: progress,
        message: 'Student progress fetched successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in getStudentProgress:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.message.includes('not found') ? 404 : 403,
          message: error.message || 'Failed to fetch student progress',
          timestamp: new Date().toISOString(),
        },
        error.message.includes('not found') ? 404 : 403,
      );
    }
  }

  async getLinkCodes(userId: string) {
    try {
      if (!userId) {
        console.error('getLinkCodes - User ID is undefined');
        throw new Error('User ID is required');
      }

      console.log(`Fetching link codes for userId: ${userId}`); // Debug log

      const codes = await this.prisma.code.findMany({
        where: {
          userId,
          type: 'LINK',
          linkedUserId: null, // Only unused codes
          expiresAt: { gt: new Date() }, // Only non-expired codes
        },
      });

      return {
        body: codes,
        message: 'Link codes retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in getLinkCodes:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: error.message || 'Failed to retrieve link codes',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async createLinkCode(userId: string) {
    try {
      if (!userId) {
        console.error('createLinkCode - User ID is undefined');
        throw new Error('User ID is required');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });

      if (!user || !user.userRoles.some((ur) => ur.role.name === 'STUDENT')) {
        throw new Error('Only students can create link codes');
      }

      const code = await this.prisma.code.create({
        data: {
          id: uuidv4(),
          code: `STU-${uuidv4().slice(0, 8).toUpperCase()}`,
          type: 'LINK',
          userId,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          createdAt: new Date(),
        },
      });

      return {
        body: code,
        message: 'Link code created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in createLinkCode:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: error.message || 'Failed to create link code',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async createStudentAccount(
    creatorId: string,
    data: {
      email: string;
      password: string;
      username: string;
      name?: string;
      orgCode?: string;
    },
  ) {
    try {
      if (!creatorId) {
        console.error('createStudentAccount - Creator ID is undefined');
        throw new Error('Creator ID is required');
      }

      // Verify creator has PARENT or TEACHER role
      const creator = await this.prisma.user.findUnique({
        where: { id: creatorId },
        include: { userRoles: { include: { role: true } } },
      });

      if (
        !creator ||
        !creator.userRoles.some(
          (ur) => ur.role.name === 'PARENT' || ur.role.name === 'TEACHER',
        )
      ) {
        throw new Error('Only parents or teachers can create student accounts');
      }

      // Check for existing user
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [{ email: data.email }, { username: data.username }],
        },
      });
      if (existingUser) {
        throw new Error('Email or username already exists');
      }

      // Validate orgCode if provided
      let organizationId: string | null = null;
      if (data.orgCode) {
        const orgCode = await this.prisma.code.findUnique({
          where: { code: data.orgCode, type: 'ORG' },
        });
        if (!orgCode || !orgCode.organizationId) {
          throw new Error('Invalid organization code');
        }
        organizationId = orgCode.organizationId;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // Create student user
      const user = await this.prisma.user.create({
        data: {
          id: uuidv4(),
          email: data.email,
          password: hashedPassword,
          username: data.username,
          name: data.name,
          actorType: 'INDIVIDUAL',
          userRoles: {
            create: {
              role: {
                connect: {
                  name_type: { name: 'STUDENT', type: 'INDIVIDUAL' },
                },
              },
            },
          },
          organizations: organizationId
            ? { create: { organizationId } }
            : undefined,
        },
        include: {
          userRoles: { include: { role: true } },
          organizations: { include: { organization: true } },
        },
      });

      // Create link code for the student
      const linkCode = await this.prisma.code.create({
        data: {
          id: uuidv4(),
          code: `STU-${uuidv4().slice(0, 8).toUpperCase()}`,
          type: 'LINK',
          userId: user.id,
          createdById: creatorId,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        },
      });

      return {
        body: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            name: user.name,
            actorType: user.actorType,
            roles: user.userRoles.map((ur) => ({
              id: ur.role.id,
              name: ur.role.name,
              type: ur.role.type,
            })),
            organizations: user.organizations.map((org) => ({
              id: org.organization.id,
              name: org.organization.name,
            })),
          },
          linkCode,
        },
        message: 'Student account created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in createStudentAccount:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: error.message || 'Failed to create student account',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async getRelatedStudents(userId: string) {
    try {
      if (!userId) {
        console.error('getRelatedStudents - User ID is undefined');
        throw new Error('User ID is required');
      }

      console.log(`Fetching related students for userId: ${userId}`); // Debug log

      const requester = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: { include: { role: true } },
        },
      });

      if (!requester) {
        console.error(`User not found for userId: ${userId}`);
        throw new Error('Requester user not found');
      }

      const isParentOrTeacher = requester.userRoles.some(
        (ur) => ur.role.name === 'PARENT' || ur.role.name === 'TEACHER',
      );

      if (!isParentOrTeacher) {
        throw new Error(
          'Only parents or teachers can view related student accounts',
        );
      }

      const codes = await this.prisma.code.findMany({
        where: {
          OR: [
            { createdById: userId, type: 'LINK' },
            { linkedUserId: userId, type: 'LINK' },
          ],
        },
        include: {
          user: {
            include: {
              userRoles: { include: { role: true } },
              organizations: { include: { organization: true } },
            },
          },
        },
      });

      const students = codes
        .filter(
          (code) =>
            code.user &&
            code.user.userRoles.some((ur) => ur.role.name === 'STUDENT'),
        )
        .map((code) => ({
          id: code.user!.id,
          email: code.user!.email,
          username: code.user!.username,
          name: code.user!.name,
          actorType: code.user!.actorType,
          linkCode: code.code,
          createdBy: code.createdById === userId,
          linked: code.linkedUserId === userId,
          organizations: code.user!.organizations.map((org) => ({
            id: org.organization.id,
            name: org.organization.name,
          })),
        }));

      console.log(
        `Found ${students.length} related students for userId: ${userId}`,
      ); // Debug log

      return {
        body: students,
        message: 'Related student accounts fetched successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in getRelatedStudents:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.message.includes('not found') ? 404 : 403,
          message: error.message || 'Failed to fetch related student accounts',
          timestamp: new Date().toISOString(),
        },
        error.message.includes('not found') ? 404 : 403,
      );
    }
  }

  async getStudentInfo(userId: string, studentId: string) {
    try {
      if (!userId) {
        console.error('getStudentInfo - User ID is undefined');
        throw new Error('User ID is required');
      }
      if (!studentId) {
        console.error('getStudentInfo - Student ID is undefined');
        throw new Error('Student ID is required');
      }

      console.log(
        `Fetching student info for userId: ${userId}, studentId: ${studentId}`,
      ); // Debug log

      const requester = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRoles: { include: { role: true } },
        },
      });

      if (!requester) {
        console.error(`User not found for userId: ${userId}`);
        throw new Error('Requester user not found');
      }

      const isParentOrTeacher = requester.userRoles.some(
        (ur) => ur.role.name === 'PARENT' || ur.role.name === 'TEACHER',
      );

      if (!isParentOrTeacher) {
        throw new Error(
          'Only parents or teachers can view student information',
        );
      }

      const code = await this.prisma.code.findFirst({
        where: {
          userId: studentId,
          type: 'LINK',
          OR: [{ createdById: userId }, { linkedUserId: userId }],
        },
        include: {
          user: {
            include: {
              userRoles: { include: { role: true } },
              organizations: { include: { organization: true } },
            },
          },
        },
      });

      if (!code || !code.user) {
        throw new Error('Student not found or not associated with requester');
      }

      if (!code.user.userRoles.some((ur) => ur.role.name === 'STUDENT')) {
        throw new Error('Specified user is not a student');
      }

      const studentInfo = {
        id: code.user.id,
        email: code.user.email,
        username: code.user.username,
        name: code.user.name,
        actorType: code.user.actorType,
        linkCode: code.code,
        createdBy: code.createdById === userId,
        linked: code.linkedUserId === userId,
        organizations: code.user.organizations.map((org) => ({
          id: org.organization.id,
          name: org.organization.name,
        })),
        // Add more student-specific data as needed, e.g., courses, grades
      };

      return {
        body: studentInfo,
        message: 'Student information fetched successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in getStudentInfo:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.message.includes('not found') ? 404 : 403,
          message: error.message || 'Failed to fetch student information',
          timestamp: new Date().toISOString(),
        },
        error.message.includes('not found') ? 404 : 403,
      );
    }
  }
}
