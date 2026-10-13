import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuditInterceptor } from './common/audit.interceptor';
import { JwtAuthGuard } from './common/auth.guard';
import { AllExceptionsFilter } from './common/exception.filter';
import { InfraModule } from './common/infra.module';
import { WorkspaceGuard } from './common/workspace.guard';
import { loadConfig } from './config';
import { HealthController } from './health.controller';
import { ImportsController } from './imports/imports.controller';
import { JobsController } from './jobs/jobs.controller';
import { ProjectsController } from './projects/projects.controller';
import { WorkspaceDataController } from './workspace-data/workspace-data.controller';
import { WorkspacesController } from './workspaces/workspaces.controller';

@Module({
  imports: [
    InfraModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const c = loadConfig();
        // expiresIn accepts vercel/ms strings such as "15m"; validated by the jwt library at sign time.
        return { secret: c.JWT_ACCESS_SECRET, signOptions: { expiresIn: c.JWT_ACCESS_TTL as `${number}m` } };
      },
    }),
    // Default API rate limit per client IP; auth routes set stricter limits via @Throttle().
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: Number(process.env.API_RATE_LIMIT_PER_MIN ?? 300) }]),
  ],
  controllers: [
    HealthController,
    AuthController,
    WorkspacesController,
    ProjectsController,
    ImportsController,
    JobsController,
    WorkspaceDataController,
  ],
  providers: [
    AuthService,
    // Guard order matters: rate limit → authenticate → resolve tenant & permission.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: WorkspaceGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
