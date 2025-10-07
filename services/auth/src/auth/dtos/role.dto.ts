import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export enum RoleType {
  SYSTEM = 'SYSTEM',
  ORGANIZATION = 'ORGANIZATION',
}

export class BulkUpsertOrgRolesDto {
  roles: Array<{
    name: string;
    type: 'ORGANIZATION';
    permissions: string[];
  }>;
}

export class AssignSystemRoleDto {
  @IsString() roleId: string; // existing SYSTEM role id (e.g., super-admin)
}

export class AssignOrgRoleDto {
  @IsString() roleName: string; // e.g., org_owner, member
}
