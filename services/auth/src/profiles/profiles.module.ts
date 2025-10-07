import { Module, forwardRef } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { RoleGuard } from '../auth/guards/role.guard';

@Module({
  imports: [forwardRef(() => AuthModule)], // Use forwardRef to break circular dependency
  controllers: [ProfilesController],
  providers: [ProfilesService, PrismaService, RoleGuard],
  exports: [ProfilesService], // Export ProfilesService for use in AuthModule
})
export class ProfilesModule {}
