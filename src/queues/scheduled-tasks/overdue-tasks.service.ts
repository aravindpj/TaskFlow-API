// src/scheduled-tasks/overdue-tasks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private readonly tasksService: TasksService, // Injected TasksService
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');

    const now = new Date();

    try {
      await this.taskQueue.add(
        'overdue-tasks-notification',
        { triggeredAt: now.toISOString() },
        {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      this.logger.log(`Successfully enqueued a job to process overdue tasks.`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to enqueue overdue tasks notification job: ${err.message}`,
        err.stack,
      );
    }

    this.logger.debug('Overdue tasks check initiated.');
  }
}
