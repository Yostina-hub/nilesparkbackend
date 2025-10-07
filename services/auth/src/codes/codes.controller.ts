// src/codes/codes.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Param,
  HttpException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { CodesService } from './codes.service';
import { AuthGuard } from '@nestjs/passport';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles, ResourcePermissions } from '../guards/decorators';
import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';

export class CreateStudentDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  username: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  orgCode?: string;
}

@Controller('codes')
export class CodesController {
  constructor(private readonly codesService: CodesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles('ADMIN', 'ORGANIZATION', 'TEACHER')
  async createCode(
    @Body()
    body: { type: 'REFERRAL' | 'ORG' | 'LINK'; organizationId?: string },
    @Request() req,
  ) {
    if (!req.user?.id) {
      console.error(
        'createCode - Missing req.user.id:',
        JSON.stringify(req.user),
      );
      throw new HttpException(
        'User ID is missing from request',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.codesService.createCode({
      type: body.type,
      userId: req.user.id,
      organizationId: body.organizationId,
    });
  }

  @Post('validate')
  @HttpCode(200)
  async validateCode(
    @Body() body: { code: string; type: 'REFERRAL' | 'ORG' | 'LINK' },
  ) {
    return this.codesService.validateCode(body);
  }

  @Post('add-to-org')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @ResourcePermissions('Organization', ['create'])
  async addToOrg(
    @Body() body: { code: string; type: 'ORG'; userId: string },
    @Request() req,
  ) {
    if (!req.user?.id) {
      console.error(
        'addToOrg - Missing req.user.id:',
        JSON.stringify(req.user),
      );
      throw new HttpException(
        'User ID is missing from request',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.codesService.addToOrg({
      code: body.code,
      type: body.type,
      userId: req.user.id,
    });
  }

  @Post('link')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @ResourcePermissions('Code', ['update'])
  async linkDependent(@Body() body: { linkCode: string }, @Request() req) {
    if (!req.user?.id) {
      console.error(
        'linkDependent - Missing req.user.id:',
        JSON.stringify(req.user),
      );
      throw new HttpException(
        'User ID is missing from request',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.codesService.linkDependent({
      linkCode: body.linkCode,
      userId: req.user.id,
    });
  }

  @Post('student-progress')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @ResourcePermissions('Code', ['read'])
  async getStudentProgress(@Body() body: { linkCode: string }, @Request() req) {
    if (!req.user?.id) {
      console.error(
        'getStudentProgress - Missing req.user.id:',
        JSON.stringify(req.user),
      );
      throw new HttpException(
        'User ID is missing from request',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.codesService.getStudentProgress(req.user.id, body.linkCode);
  }

  @Get('link')
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles('STUDENT')
  async getLinkCodes(@Request() req) {
    if (!req.user?.id) {
      console.error(
        'getLinkCodes - Missing req.user.id:',
        JSON.stringify(req.user),
      );
      throw new HttpException(
        'User ID is missing from request',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.codesService.getLinkCodes(req.user.id);
  }

  @Post('link')
  @HttpCode(201)
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles('STUDENT')
  async createLinkCode(@Request() req) {
    if (!req.user?.id) {
      console.error(
        'createLinkCode - Missing req.user.id:',
        JSON.stringify(req.user),
      );
      throw new HttpException(
        'User ID is missing from request',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.codesService.createLinkCode(req.user.id);
  }

  @Post('create-student')
  @HttpCode(201)
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles('PARENT', 'TEACHER')
  async createStudentAccount(@Body() body: CreateStudentDto, @Request() req) {
    if (!req.user?.id) {
      console.error(
        'createStudentAccount - Missing req.user.id:',
        JSON.stringify(req.user),
      );
      throw new HttpException(
        'User ID is missing from request',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.codesService.createStudentAccount(req.user.id, {
      email: body.email,
      password: body.password,
      username: body.username,
      name: body.name,
      orgCode: body.orgCode,
    });
  }

  @Get('related-students')
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles('PARENT', 'TEACHER')
  async getRelatedStudents(@Request() req) {
    if (!req.user?.id) {
      console.error(
        'getRelatedStudents - Missing req.user.id:',
        JSON.stringify(req.user),
      );
      throw new HttpException(
        'User ID is missing from request',
        HttpStatus.UNAUTHORIZED,
      );
    }
    console.log('getRelatedStudents - User ID:', req.user.id); // Debug log
    return this.codesService.getRelatedStudents(req.user.id);
  }

  @Get('student/:studentId')
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @Roles('PARENT', 'TEACHER')
  async getStudentInfo(@Param('studentId') studentId: string, @Request() req) {
    if (!req.user?.id) {
      console.error(
        'getStudentInfo - Missing req.user.id:',
        JSON.stringify(req.user),
      );
      throw new HttpException(
        'User ID is missing from request',
        HttpStatus.UNAUTHORIZED,
      );
    }
    console.log(
      'getStudentInfo - User ID:',
      req.user.id,
      'Student ID:',
      studentId,
    ); // Debug log
    return this.codesService.getStudentInfo(req.user.id, studentId);
  }
}
