import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';
import { TaskProcessorModule } from './queues/task-processor/task-processor.module';
import { ScheduledTasksModule } from './queues/scheduled-tasks/scheduled-tasks.module';
import { CacheService } from './common/services/cache.service';
import jwtConfig from '@config/jwt.config';
import bullConfig from '@config/bull.config';
import databaseConfig from '@config/database.config';
import { MailerModule } from '@nestjs-modules/mailer';
import mailConfig from '@config/mail.config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { RateLimitGuard } from '@common/guards/rate-limit.guard';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig, bullConfig, databaseConfig, mailConfig],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('database.synchronize') === 'development',
        logging: configService.get('database.logging') === 'development',
      }),
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Queue
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: configService.get('bull.connection'),
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: 60,
          limit: 10,
        },
      ],
    }),

    //Nodemailer
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        transport: configService.get('mail.transport'),
        defaults: configService.get('mail.defaults'),
      }),
      inject: [ConfigService],
    }),
    // Feature modules
    UsersModule,
    TasksModule,
    AuthModule,

    // Queue processing modules
    TaskProcessorModule,
    ScheduledTasksModule,
  ],
  providers: [
    // Inefficient: Global cache service with no configuration options
    // This creates a single in-memory cache instance shared across all modules
    CacheService,

    {
      provide: APP_GUARD,
      useClass: RateLimitGuard, // Apply globally
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
  exports: [
    // Exporting the cache service makes it available to other modules
    // but creates tight coupling
    CacheService,
  ],
})
export class AppModule {}
