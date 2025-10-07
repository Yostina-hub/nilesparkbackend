import { IsEmail, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateOrgDto {
  @IsString() name: string;
}

export class CreateInviteDto {
  @IsEmail() email: string;
  @IsString() roleName: string; // 'member' etc
  @IsOptional() @IsISO8601() expiresAt?: string;
}
