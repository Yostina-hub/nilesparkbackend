import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
} from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class SignUpDto {
  @IsString()
  inviteToken: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsEnum(['STUDENT', 'TEACHER', 'PARENT', 'ORGANIZATION'])
  roleName: string;

  @IsEnum(['INDIVIDUAL', 'INSTITUTION'])
  actorType: 'INDIVIDUAL' | 'INSTITUTION';

  @IsString()
  @IsOptional()
  orgCode?: string;

  @IsString()
  @IsOptional()
  linkCode?: string;
}

export class PublicSignUpDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsEnum(['STUDENT', 'TEACHER', 'PARENT', 'ORGANIZATION'])
  roleName: string;

  @IsEnum(['INDIVIDUAL', 'INSTITUTION'])
  actorType: 'INDIVIDUAL' | 'INSTITUTION';

  @IsString()
  @IsOptional()
  orgCode?: string;

  @IsString()
  @IsOptional()
  linkCode?: string;
}
