// src/users/users.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import { SystemRole } from '../guards/decorators';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get(':id')
  @SystemRole()
  getUser(@Param('id') id: string) {
    return this.usersService.getUser(id);
  }
}
