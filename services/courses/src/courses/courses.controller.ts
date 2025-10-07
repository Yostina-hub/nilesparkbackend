import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CoursesService } from './courses.service';
import { AuthGuard } from '@nestjs/passport';
import {
  CreateCourseDto,
  UpdateCourseDto,
  CreateNuggetDto,
  CreateLearningMaterialDto,
  CreateQuestionDto,
  CreateCourseConnectionDto,
} from './dto';
import { RolesGuard } from './guards/roles.guard';
import { ResourcePermissions, Roles } from './guards/decorators';
import { ResourceGuard } from './guards/resource.guard';

@Controller('courses')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @HttpCode(201)
  @Roles('TEACHER', 'ADMIN', 'SYSTEM_USER')
  @ResourcePermissions('Course', ['create'])
  @UseGuards(ResourceGuard)
  createCourse(@Body() dto: CreateCourseDto) {
    return this.coursesService.createCourse(dto);
  }

  @Get()
  @ResourcePermissions('Course', ['read'])
  @UseGuards(ResourceGuard)
  getAllCourses() {
    return this.coursesService.getAllCourses();
  }
  @Get('connections')
  @ResourcePermissions('CourseConnection', ['read'])
  @UseGuards(ResourceGuard)
  getAllCourseConnections() {
    return this.coursesService.getAllCourseConnections();
  }

  @Get(':id')
  @ResourcePermissions('Course', ['read'])
  @UseGuards(ResourceGuard)
  getCourse(@Param('id') id: string) {
    return this.coursesService.getCourse(id);
  }

  @Put(':id')
  @HttpCode(200)
  @Roles('TEACHER', 'ADMIN', 'SYSTEM_USER')
  @ResourcePermissions('Course', ['update'])
  @UseGuards(ResourceGuard)
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.updateCourse(id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @Roles('ADMIN', 'SYSTEM_USER')
  @ResourcePermissions('Course', ['delete'])
  @UseGuards(ResourceGuard)
  deleteCourse(@Param('id') id: string) {
    return this.coursesService.deleteCourse(id);
  }

  @Post('connections')
  @HttpCode(201)
  @Roles('TEACHER', 'ADMIN', 'SYSTEM_USER')
  @ResourcePermissions('CourseConnection', ['create'])
  @UseGuards(ResourceGuard)
  createCourseConnection(@Body() dto: CreateCourseConnectionDto) {
    return this.coursesService.createCourseConnection(dto);
  }

  @Get('connections/:id')
  @ResourcePermissions('CourseConnection', ['read'])
  @UseGuards(ResourceGuard)
  getCourseConnection(@Param('id') id: string) {
    return this.coursesService.getCourseConnection(id);
  }

  @Put('connections/:id')
  @HttpCode(200)
  @Roles('TEACHER', 'ADMIN', 'SYSTEM_USER')
  @ResourcePermissions('CourseConnection', ['update'])
  @UseGuards(ResourceGuard)
  updateCourseConnection(
    @Param('id') id: string,
    @Body() dto: CreateCourseConnectionDto,
  ) {
    return this.coursesService.updateCourseConnection(id, dto);
  }

  @Delete('connections/:id')
  @HttpCode(200)
  @Roles('ADMIN', 'SYSTEM_USER')
  @ResourcePermissions('CourseConnection', ['delete'])
  @UseGuards(ResourceGuard)
  deleteCourseConnection(@Param('id') id: string) {
    return this.coursesService.deleteCourseConnection(id);
  }

  @Post('connections/:connectionId/enroll')
  @HttpCode(201)
  @Roles('STUDENT')
  @ResourcePermissions('ConnectionEnrollment', ['create'])
  @UseGuards(ResourceGuard)
  enrollInConnection(
    @Param('connectionId') connectionId: string,
    @Body('userId') userId: string,
  ) {
    return this.coursesService.enrollInConnection(connectionId, userId);
  }

  @Get('connections/enrolled/:userId')
  @Roles('STUDENT')
  @ResourcePermissions('ConnectionEnrollment', ['read'])
  @UseGuards(ResourceGuard)
  getEnrolledConnections(@Param('userId') userId: string) {
    return this.coursesService.getEnrolledConnections(userId);
  }

  @Post(':courseId/nuggets')
  @HttpCode(201)
  @Roles('TEACHER', 'ADMIN', 'SYSTEM_USER')
  @ResourcePermissions('Nugget', ['create'])
  @UseGuards(ResourceGuard)
  createNugget(
    @Param('courseId') courseId: string,
    @Body() dto: CreateNuggetDto,
  ) {
    return this.coursesService.createNugget(courseId, dto);
  }

  @Post(':courseId/nuggets/:nuggetId/materials')
  @HttpCode(201)
  @Roles('TEACHER', 'ADMIN', 'SYSTEM_USER')
  @ResourcePermissions('LearningMaterial', ['create'])
  @UseGuards(ResourceGuard)
  @UseInterceptors(FilesInterceptor('file', 10))
  createLearningMaterial(
    @Param('courseId') courseId: string,
    @Param('nuggetId') nuggetId: string,
    @Body() dto: CreateLearningMaterialDto,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^(image\/(jpeg|png)|video\/(mp4|mpeg|webm))$/,
          }),
        ],
      }),
    )
    files: Express.Multer.File[],
  ) {
    return this.coursesService.createLearningMaterial(courseId, nuggetId, {
      ...dto,
      files,
    });
  }

  @Get(':courseId/nuggets/:nuggetId/materials/:materialId/stream')
  @ResourcePermissions('LearningMaterial', ['read'])
  @UseGuards(ResourceGuard)
  async streamMaterial(@Param('materialId') materialId: string) {
    const material = await this.coursesService.getMaterial(materialId);
    if (!material || !material.manifestUrl) {
      throw new HttpException(
        {
          status: 'error',
          statusCode: 404,
          message: 'Material or manifest not found',
          timestamp: new Date().toISOString(),
        },
        404,
      );
    }
    return { manifestUrl: material.manifestUrl };
  }

  @Post(':courseId/nuggets/:nuggetId/questions')
  @HttpCode(201)
  @Roles('TEACHER', 'ADMIN', 'SYSTEM_USER')
  @ResourcePermissions('Question', ['create'])
  @UseGuards(ResourceGuard)
  @UseInterceptors(FileInterceptor('image'))
  createQuestion(
    @Param('courseId') courseId: string,
    @Param('nuggetId') nuggetId: string,
    @Body() dto: CreateQuestionDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.coursesService.createQuestion(courseId, nuggetId, {
      ...dto,
      image,
    });
  }

  @Get(':courseId/nuggets/:nuggetId/materials')
  @ResourcePermissions('LearningMaterial', ['read'])
  @UseGuards(ResourceGuard)
  async getLearningMaterials(
    @Param('courseId') courseId: string,
    @Param('nuggetId') nuggetId: string,
  ) {
    return this.coursesService.getLearningMaterials(courseId, nuggetId);
  }

  @Post(':courseId/enroll')
  @HttpCode(201)
  @Roles('STUDENT')
  @ResourcePermissions('Enrollment', ['create'])
  @UseGuards(ResourceGuard)
  enroll(@Param('courseId') courseId: string, @Body('userId') userId: string) {
    return this.coursesService.enroll(courseId, userId);
  }

  @Post(':courseId/nuggets/:nuggetId/submit-answer')
  @HttpCode(201)
  @Roles('STUDENT')
  @ResourcePermissions('Answer', ['create'])
  @UseGuards(ResourceGuard)
  submitAnswer(
    @Param('courseId') courseId: string,
    @Param('nuggetId') nuggetId: string,
    @Body() dto: { questionId: string; content: any; userId: string },
  ) {
    return this.coursesService.submitAnswer(courseId, nuggetId, dto);
  }

  @Get('enrolled/:userId')
  @Roles('STUDENT')
  @ResourcePermissions('Enrollment', ['read'])
  @UseGuards(ResourceGuard)
  getEnrolledCourses(@Param('userId') userId: string) {
    return this.coursesService.getEnrolledCourses(userId);
  }

  @Get(':courseId/progress/:userId')
  @Roles('STUDENT')
  @ResourcePermissions('Enrollment', ['read'])
  @UseGuards(ResourceGuard)
  getCourseProgress(
    @Param('courseId') courseId: string,
    @Param('userId') userId: string,
  ) {
    return this.coursesService.getCourseProgress(courseId, userId);
  }

  @Get(':courseId/nuggets/:nuggetId/progress/:userId')
  @Roles('STUDENT')
  @ResourcePermissions('Enrollment', ['read'])
  @UseGuards(ResourceGuard)
  getNuggetProgress(
    @Param('courseId') courseId: string,
    @Param('nuggetId') nuggetId: string,
    @Param('userId') userId: string,
  ) {
    return this.coursesService.getNuggetProgress(courseId, nuggetId, userId);
  }

  @Get(':courseId/nuggets/:nuggetId/materials/:materialId/complete')
  @HttpCode(201)
  @Roles('STUDENT')
  @ResourcePermissions('LearningMaterial', ['update'])
  @UseGuards(ResourceGuard)
  markMaterialComplete(
    @Param('courseId') courseId: string,
    @Param('nuggetId') nuggetId: string,
    @Param('materialId') materialId: string,
    @Body('userId') userId: string,
  ) {
    return this.coursesService.markMaterialComplete(
      courseId,
      nuggetId,
      materialId,
      userId,
    );
  }
}
