// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RolesModule } from './roles/roles.module';
import { CodesModule } from './codes/codes.module';
import { InvitesModule } from './invites/invites.module';
import { PrismaService } from '../prisma/prisma.service';
import { ResourcesModule } from './resources/resources.module';
import { ProfilesModule } from './profiles/profiles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 100,
      },
    ]),
    AuthModule,
    UsersModule,
    OrganizationsModule,
    RolesModule,
    CodesModule,
    InvitesModule,
    ResourcesModule,
    ProfilesModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
