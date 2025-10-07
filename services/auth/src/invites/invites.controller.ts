// src/invites/invites.controller.ts
import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { AuthGuard } from '@nestjs/passport';
import { SystemRole } from '../guards/decorators';

@Controller('invites')
@UseGuards(AuthGuard('jwt'))
export class InvitesController {
  constructor(private invitesService: InvitesService) {}

  @Post()
  @SystemRole()
  createInvite(
    @Body() data: { email: string; roleId?: string; organizationId?: string },
    @Request() req,
  ) {
    return this.invitesService.createInvite({
      ...data,
      inviterId: req.user.id,
    });
  }
}
