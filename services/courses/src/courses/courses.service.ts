import { Injectable, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioClientService } from '../minio/minio.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  CreateCourseDto,
  UpdateCourseDto,
  CreateNuggetDto,
  CreateLearningMaterialDto,
  CreateQuestionDto,
  CreateCourseConnectionDto,
} from './dto';
import { ConfigService } from '@nestjs/config';
import { LearningMaterial } from '@prisma/client';
import { TranscodeService } from 'src/transcode/transcode.service';
import { v4 as uuidv4 } from 'uuid';
import { isEqual } from 'lodash';

interface CreateLearningMaterialWithFilesDto extends CreateLearningMaterialDto {
  files: Express.Multer.File[];
}

interface CreateQuestionWithImageDto extends CreateQuestionDto {
  image?: Express.Multer.File;
}

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioClientService,
    private httpService: HttpService,
    private transcodeService: TranscodeService,
    private configService: ConfigService,
  ) {}

  async checkPermissions(
    userId: string,
    resource: string,
    permissions: string[],
    jwt: string,
  ) {
    const authServiceUrl =
      this.configService.get('AUTH_SERVICE_URL') || 'http://auth:3001';
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${authServiceUrl}/auth/check-permissions`,
          { resource, permissions },
          { headers: { Authorization: `Bearer ${jwt}` } },
        ),
      );
      return response.data.body.hasPermissions;
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 403,
          message: 'Failed to check permissions',
          timestamp: new Date().toISOString(),
        },
        403,
      );
    }
  }

  async createCourse(dto: CreateCourseDto) {
    try {
      const course = await this.prisma.course.create({
        data: {
          title: dto.title,
          description: dto.description,
          createdById: dto.createdById,
          organizationId: dto.organizationId,
        },
      });
      return {
        body: course,
        message: 'Course created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to create course',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async getAllCourses() {
    try {
      const courses = await this.prisma.course.findMany({
        include: {
          nuggets: { include: { learningMaterials: true, questions: true } },
        },
      });
      return {
        body: courses,
        message: 'Courses retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to retrieve courses',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async createCourseConnection(dto: CreateCourseConnectionDto) {
    try {
      // Verify all courses exist and were created by the user (if teacher)
      const courses = await this.prisma.course.findMany({
        where: {
          id: { in: dto.courseIds },
          ...(dto.role === 'TEACHER' ? { createdById: dto.createdById } : {}),
        },
      });
      if (courses.length !== dto.courseIds.length) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 400,
            message: 'One or more courses not found or unauthorized',
            timestamp: new Date().toISOString(),
          },
          400,
        );
      }

      const connection = await this.prisma.courseConnection.create({
        data: {
          title: dto.title,
          description: dto.description,
          createdById: dto.createdById,
          organizationId: dto.organizationId,
          courses: {
            create: dto.courseIds.map((courseId) => ({
              courseId,
            })),
          },
        },
        include: { courses: { include: { course: true } } },
      });
      return {
        body: connection,
        message: 'Course connection created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to create course connection',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async getAllCourseConnections() {
    try {
      const connections = await this.prisma.courseConnection.findMany({
        include: { courses: { include: { course: true } } },
      });
      return {
        body: connections,
        message: 'Course connections retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to retrieve course connections',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async getCourseConnection(id: string) {
    try {
      const connection = await this.prisma.courseConnection.findUnique({
        where: { id },
        include: { courses: { include: { course: true } } },
      });
      if (!connection) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Course connection not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }
      return {
        body: connection,
        message: 'Course connection retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to retrieve course connection',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async updateCourseConnection(id: string, dto: CreateCourseConnectionDto) {
    try {
      // Verify connection exists
      const existingConnection = await this.prisma.courseConnection.findUnique({
        where: { id },
      });
      if (!existingConnection) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Course connection not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      // Verify all courses exist and were created by the user (if teacher)
      const courses = await this.prisma.course.findMany({
        where: {
          id: { in: dto.courseIds },
          ...(dto.role === 'TEACHER' ? { createdById: dto.createdById } : {}),
        },
      });
      if (courses.length !== dto.courseIds.length) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 400,
            message: 'One or more courses not found or unauthorized',
            timestamp: new Date().toISOString(),
          },
          400,
        );
      }

      // Update connection in a transaction
      const connection = await this.prisma.$transaction(async (prisma) => {
        // Delete existing course connections
        await prisma.courseConnectionCourses.deleteMany({
          where: { courseConnectionId: id },
        });

        // Update connection and create new course connections
        return prisma.courseConnection.update({
          where: { id },
          data: {
            title: dto.title,
            description: dto.description,
            organizationId: dto.organizationId,
            courses: {
              create: dto.courseIds.map((courseId) => ({
                courseId,
              })),
            },
          },
          include: { courses: { include: { course: true } } },
        });
      });

      console.log('Updated connection:', connection);
      return {
        body: connection,
        message: 'Course connection updated successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in updateCourseConnection:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to update course connection',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }
  async deleteCourseConnection(id: string) {
    try {
      await this.prisma.courseConnection.delete({ where: { id } });
      return {
        body: null,
        message: 'Course connection deleted successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to delete course connection',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async enrollInConnection(connectionId: string, userId: string) {
    try {
      const connection = await this.prisma.courseConnection.findUnique({
        where: { id: connectionId },
        include: { courses: { include: { course: true } } },
      });
      if (!connection) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Course connection not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      // Check if already enrolled in the connection
      const existingEnrollment =
        await this.prisma.connectionEnrollment.findUnique({
          where: {
            userId_courseConnectionId: {
              userId,
              courseConnectionId: connectionId,
            },
          },
        });
      if (existingEnrollment) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 400,
            message: 'User already enrolled in this course connection',
            timestamp: new Date().toISOString(),
          },
          400,
        );
      }

      // Enroll in all courses in the connection
      const courseIds = connection.courses.map((c) => c.courseId);
      const enrollments = await this.prisma.$transaction(
        courseIds.map((courseId) =>
          this.prisma.enrollment.upsert({
            where: { userId_courseId: { userId, courseId } },
            create: { userId, courseId },
            update: {},
          }),
        ),
      );

      // Create connection enrollment
      const connectionEnrollment =
        await this.prisma.connectionEnrollment.create({
          data: { userId, courseConnectionId: connectionId },
        });

      return {
        body: { connectionEnrollment, courseEnrollments: enrollments },
        message: 'Enrolled in course connection successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to enroll in course connection',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async getEnrolledConnections(userId: string) {
    try {
      const enrollments = await this.prisma.connectionEnrollment.findMany({
        where: { userId },
        include: {
          courseConnection: {
            include: { courses: { include: { course: true } } },
          },
        },
      });
      return {
        body: enrollments,
        message: 'Enrolled course connections retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to retrieve enrolled course connections',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async getLearningMaterials(courseId: string, nuggetId: string) {
    try {
      const nugget = await this.prisma.nugget.findUnique({
        where: { id: nuggetId },
        include: { course: true },
      });
      if (!nugget || nugget.courseId !== courseId) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Nugget or course not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      const materials = await this.prisma.learningMaterial.findMany({
        where: { nuggetId },
      });

      return {
        body: materials,
        message: 'Learning materials retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to retrieve learning materials',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async getCourse(id: string) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id },
        include: {
          nuggets: { include: { learningMaterials: true, questions: true } },
        },
      });
      if (!course) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Course not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }
      return {
        body: course,
        message: 'Course retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to retrieve course',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async updateCourse(id: string, dto: UpdateCourseDto) {
    try {
      const course = await this.prisma.course.update({
        where: { id },
        data: { title: dto.title, description: dto.description },
      });
      return {
        body: course,
        message: 'Course updated successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to update course',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async deleteCourse(id: string) {
    try {
      await this.prisma.course.delete({ where: { id } });
      return {
        body: null,
        message: 'Course deleted successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to delete course',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async createNugget(courseId: string, dto: CreateNuggetDto) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
      });
      if (!course) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Course not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }
      const nugget = await this.prisma.nugget.create({
        data: {
          title: dto.title,
          courseId,
        },
      });
      return {
        body: nugget,
        message: 'Nugget created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to create nugget',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async createLearningMaterial(
    courseId: string,
    nuggetId: string,
    dto: CreateLearningMaterialWithFilesDto,
  ) {
    try {
      const nugget = await this.prisma.nugget.findUnique({
        where: { id: nuggetId },
        include: { course: true },
      });
      if (!nugget || nugget.courseId !== courseId) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Nugget or course not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      const material = await this.prisma.learningMaterial.create({
        data: {
          nuggetId,
          type: dto.type,
          title: dto.title,
          url: '',
          status: 'PENDING',
        },
      });

      if (dto.files && dto.files.length > 0) {
        const file = dto.files[0];
        const fileUrl = await this.minioService.uploadFile(file, 'materials');
        await this.prisma.learningMaterial.update({
          where: { id: material.id },
          data: { url: fileUrl },
        });

        if (dto.type === 'VIDEO') {
          const jobId = await this.transcodeService.queueTranscodeVideo(
            fileUrl,
            'materials',
            material.id,
            file.originalname,
          );
          await this.prisma.learningMaterial.update({
            where: { id: material.id },
            data: { jobId },
          });
        }
      }

      return {
        body: material,
        message: 'Learning material created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to create learning material',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async getMaterial(materialId: string): Promise<LearningMaterial> {
    const material = await this.prisma.learningMaterial.findUnique({
      where: { id: materialId },
    });
    if (!material) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 404,
          message: 'Material not found',
          timestamp: new Date().toISOString(),
        },
        404,
      );
    }
    return material;
  }

  async createQuestion(
    courseId: string,
    nuggetId: string,
    dto: CreateQuestionWithImageDto,
  ) {
    try {
      const nugget = await this.prisma.nugget.findUnique({
        where: { id: nuggetId },
        include: { course: true },
      });
      if (!nugget || nugget.courseId !== courseId) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Nugget or course not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      let imageUrl: string | undefined;
      if (dto.image) {
        imageUrl = await this.minioService.uploadFile(dto.image, 'questions');
      }

      const question = await this.prisma.question.create({
        data: {
          nuggetId,
          title: dto.title,
          type: dto.type,
          content: dto.content,
          correctAnswer: dto.correctAnswer,
          imageUrl,
        },
      });

      return {
        body: question,
        message: 'Question created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to create question',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async enroll(courseId: string, userId: string) {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
      });
      if (!course) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Course not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      const enrollment = await this.prisma.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: { userId, courseId },
        update: {},
      });

      return {
        body: enrollment,
        message: 'Enrolled in course successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to enroll in course',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async submitAnswer(
    courseId: string,
    nuggetId: string,
    dto: { questionId: string; content: any; userId: string },
  ) {
    try {
      const nugget = await this.prisma.nugget.findUnique({
        where: { id: nuggetId },
        include: { course: true },
      });
      if (!nugget || nugget.courseId !== courseId) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Nugget or course not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      const question = await this.prisma.question.findUnique({
        where: { id: dto.questionId },
      });
      if (!question) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Question not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      let isCorrect: boolean | undefined;
      if (question.correctAnswer) {
        isCorrect = isEqual(dto.content, question.correctAnswer);
      }

      const answer = await this.prisma.answer.create({
        data: {
          questionId: dto.questionId,
          userId: dto.userId,
          content: dto.content,
          isCorrect,
        },
      });

      // Update study session
      let studySession = await this.prisma.studySession.findFirst({
        where: { userId: dto.userId, nuggetId },
      });
      if (!studySession) {
        const enrollment = await this.prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: dto.userId, courseId } },
        });
        if (!enrollment) {
          throw new HttpException(
            {
              status: 'error',
              statusCode: 404,
              message: 'Enrollment not found',
              timestamp: new Date().toISOString(),
            },
            404,
          );
        }
        studySession = await this.prisma.studySession.create({
          data: {
            userId: dto.userId,
            enrollmentId: enrollment.id,
            nuggetId,
            status: 'IN_PROGRESS',
            completedMaterials: [],
            completedQuestions: [],
          },
        });
      }

      const completedQuestions =
        (studySession.completedQuestions as any[]) || [];
      if (!completedQuestions.some((q) => q.questionId === dto.questionId)) {
        completedQuestions.push({ questionId: dto.questionId, isCorrect });
        await this.prisma.studySession.update({
          where: { id: studySession.id },
          data: {
            completedQuestions,
            updatedAt: new Date(),
          },
        });
      }

      // Update progress
      await this.updateStudySessionProgress(dto.userId, nuggetId);

      return {
        body: { answer, isCorrect },
        message: 'Answer submitted successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to submit answer',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async getEnrolledCourses(userId: string) {
    try {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { userId },
        include: { course: true },
      });
      return {
        body: enrollments,
        message: 'Enrolled courses retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 400,
          message: 'Failed to retrieve enrolled courses',
          timestamp: new Date().toISOString(),
        },
        400,
      );
    }
  }

  async getCourseProgress(courseId: string, userId: string) {
    try {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
        include: {
          course: { include: { nuggets: true } },
          studySessions: { include: { nugget: true } },
        },
      });
      if (!enrollment) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Enrollment not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      const totalNuggets = enrollment.course.nuggets.length;
      const completedNuggets = enrollment.studySessions.filter(
        (s) => s.percentComplete === 100,
      ).length;
      const percentComplete =
        totalNuggets > 0 ? (completedNuggets / totalNuggets) * 100 : 0;

      return {
        body: {
          courseId,
          totalNuggets,
          completedNuggets,
          percentComplete,
          studySessions: enrollment.studySessions,
        },
        message: 'Course progress retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to retrieve course progress',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async getNuggetProgress(courseId: string, nuggetId: string, userId: string) {
    try {
      const nugget = await this.prisma.nugget.findUnique({
        where: { id: nuggetId },
        include: {
          course: true,
          learningMaterials: true,
          questions: true,
        },
      });
      if (!nugget || nugget.courseId !== courseId) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Nugget or course not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      const studySession = await this.prisma.studySession.findFirst({
        where: { userId, nuggetId },
        include: { enrollment: true },
      });
      if (!studySession) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Study session not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      const completedQuestions =
        (studySession.completedQuestions as any[]) || [];
      const completedMaterials =
        (studySession.completedMaterials as any[]) || [];
      const correctQuestions = completedQuestions.filter(
        (q: any) => q.isCorrect,
      ).length;

      const questionDetails = await Promise.all(
        completedQuestions.map(async (q: any) => {
          const question = await this.prisma.question.findUnique({
            where: { id: q.questionId },
            select: { id: true, title: true },
          });
          return {
            questionId: q.questionId,
            title: question?.title || 'Unknown',
            isCorrect: q.isCorrect,
          };
        }),
      );

      return {
        body: {
          nuggetId: nugget.id,
          title: nugget.title,
          totalQuestions: nugget.questions.length,
          completedQuestions: completedQuestions.length,
          correctQuestions,
          questionDetails,
          totalMaterials: nugget.learningMaterials.length,
          completedMaterials: completedMaterials.length,
          completedMaterialIds: completedMaterials,
          completionPercentage:
            nugget.questions.length + nugget.learningMaterials.length > 0
              ? ((completedQuestions.length + completedMaterials.length) /
                  (nugget.questions.length + nugget.learningMaterials.length)) *
                100
              : 0,
        },
        message: 'Nugget progress retrieved successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to retrieve nugget progress',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  async markMaterialComplete(
    courseId: string,
    nuggetId: string,
    materialId: string,
    userId: string,
  ) {
    try {
      console.log(
        `markMaterialComplete called with courseId: ${courseId}, nuggetId: ${nuggetId}, materialId: ${materialId}, userId: ${userId}`,
      );

      const nugget = await this.prisma.nugget.findUnique({
        where: { id: nuggetId },
        include: { course: true },
      });
      console.log('Nugget query result:', nugget);
      if (!nugget || nugget.courseId !== courseId) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Nugget or course not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      const material = await this.prisma.learningMaterial.findUnique({
        where: { id: materialId },
      });
      console.log('Material query result:', material);
      if (!material) {
        throw new HttpException(
          {
            status: 'error',
            statusCode: 404,
            message: 'Material not found',
            timestamp: new Date().toISOString(),
          },
          404,
        );
      }

      let studySession = await this.prisma.studySession.findFirst({
        where: { userId, nuggetId },
      });
      console.log('Study session query result:', studySession);
      if (!studySession) {
        const enrollment = await this.prisma.enrollment.findUnique({
          where: { userId_courseId: { userId, courseId } },
        });
        console.log('Enrollment query result:', enrollment);
        if (!enrollment) {
          throw new HttpException(
            {
              status: 'error',
              statusCode: 404,
              message: 'Enrollment not found',
              timestamp: new Date().toISOString(),
            },
            404,
          );
        }
        studySession = await this.prisma.studySession.create({
          data: {
            userId,
            enrollmentId: enrollment.id,
            nuggetId,
            status: 'IN_PROGRESS',
            completedMaterials: [],
            completedQuestions: [],
          },
        });
        console.log('Created study session:', studySession);
      }

      const completedMaterials =
        (studySession.completedMaterials as any[]) || [];
      if (!completedMaterials.includes(materialId)) {
        completedMaterials.push(materialId);
        await this.prisma.studySession.update({
          where: { id: studySession.id },
          data: {
            completedMaterials,
            updatedAt: new Date(),
          },
        });
        console.log(
          'Updated study session with completed material:',
          materialId,
        );
      }

      // Update percentComplete
      await this.updateStudySessionProgress(userId, nuggetId);

      return {
        body: { materialId, completed: true },
        message: 'Material marked as complete',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in markMaterialComplete:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: error.status || 400,
          message: error.message || 'Failed to mark material as complete',
          timestamp: new Date().toISOString(),
        },
        error.status || 400,
      );
    }
  }

  private async updateStudySessionProgress(userId: string, nuggetId: string) {
    try {
      const studySession = await this.prisma.studySession.findFirst({
        where: { userId, nuggetId },
        include: {
          nugget: { include: { learningMaterials: true, questions: true } },
        },
      });
      if (!studySession) return;

      const totalItems =
        studySession.nugget.learningMaterials.length +
        studySession.nugget.questions.length;
      const completedItems =
        ((studySession.completedMaterials as any[])?.length || 0) +
        ((studySession.completedQuestions as any[])?.length || 0);
      const percentComplete =
        totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

      await this.prisma.studySession.update({
        where: { id: studySession.id },
        data: {
          percentComplete,
          status: percentComplete === 100 ? 'COMPLETED' : studySession.status,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(
        `Failed to update study session progress: ${error.message}`,
      );
    }
  }
}
