// src/invites/invites.module.ts
import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [InvitesController],
  providers: [InvitesService, PrismaService],
})
export class InvitesModule {}
