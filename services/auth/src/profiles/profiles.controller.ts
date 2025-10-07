// src/profiles/profiles.controller.ts
import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Request,
  UseGuards,
  HttpCode,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProfilesService } from './profiles.service';
import { RoleGuard } from '../auth/guards/role.guard';
import { ResourcePermissions } from '../guards/decorators';

@Controller('profiles')
export class ProfilesController {
  constructor(private profilesService: ProfilesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @ResourcePermissions('Profile', ['create'])
  createProfile(
    @Request() req,
    @Body() data: { bio?: string; avatar?: string },
  ) {
    return this.profilesService.createProfile(req.user.sub, data);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @ResourcePermissions('Profile', ['read'])
  getProfile(@Request() req) {
    return this.profilesService.getProfile(req.user.sub);
  }

  @Get(':userId')
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @ResourcePermissions('Profile', ['read'])
  getUserProfile(@Param('userId') userId: string) {
    return this.profilesService.getProfile(userId);
  }

  @Put()
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'), RoleGuard)
  @ResourcePermissions('Profile', ['update'])
  updateProfile(
    @Request() req,
    @Body() data: { bio?: string; avatar?: string },
  ) {
    return this.profilesService.updateProfile(req.user.sub, data, req.user.sub);
  }
}
