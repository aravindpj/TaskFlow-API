import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskProcessorService } from './task-processor.service';
import { TasksModule } from '../../modules/tasks/tasks.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'task-processing',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential', // Exponential backoff (1s, 2s, 4s, etc.)
          delay: 1000, // Initial delay of 1 second
        },
        removeOnComplete: true, // Remove job from queue when complete
        removeOnFail: false, // Keep failed jobs for inspection (for debugging)
      },
    }),
    TasksModule,
  ],
  providers: [TaskProcessorService],
  exports: [TaskProcessorService],
})
export class TaskProcessorModule {}
