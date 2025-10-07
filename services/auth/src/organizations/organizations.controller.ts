// src/organizations/organizations.controller.ts
import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '@nestjs/passport';
import { SystemRole } from '../guards/decorators';

@Controller('organizations')
@UseGuards(AuthGuard('jwt'))
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Post()
  @SystemRole()
  createOrganization(@Body() data: { name: string }, @Request() req) {
    return this.organizationsService.createOrganization({
      name: data.name,
      userId: req.user.id,
    });
  }
}
