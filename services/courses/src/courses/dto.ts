import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsJSON,
  IsDefined,
  IsArray,
} from 'class-validator';
import { MaterialType, QuestionType } from '@prisma/client';

export class CreateCourseDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  createdById: string;

  @IsString()
  @IsOptional()
  organizationId?: string;
}

export class CreateCourseConnectionDto {
  @IsString() title: string;

  @IsString() @IsOptional() description?: string;

  @IsString() createdById: string;

  @IsString() @IsOptional() organizationId?: string;

  @IsArray() @IsString({ each: true }) courseIds: string[];

  @IsString() @IsOptional() role?: string;
}
export class UpdateCourseDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateNuggetDto {
  @IsString()
  title: string;

  @IsInt()
  @IsOptional()
  order?: number;
}

export class CreateLearningMaterialDto {
  @IsEnum(MaterialType)
  type: MaterialType;

  @IsString()
  title: string;
}

export class CreateQuestionDto {
  @IsString()
  title: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsJSON()
  content: any;

  @IsJSON()
  @IsOptional()
  correctAnswer?: any;
}
