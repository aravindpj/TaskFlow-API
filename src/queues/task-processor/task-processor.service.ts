// src/task-processor/task-processor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum'; // Import TaskStatus for validation
import { FindManyOptions, LessThan } from 'typeorm'; // Import for querying overdue tasks
import { MailerService } from '@nestjs-modules/mailer';
interface IMailerService {
  sendMail(options: { to: string; subject: string; html: string }): Promise<any>;
}
@Injectable()
// Inefficient implementation:
// - No proper job batching (Addressed by example in handleOverdueTasks, and overall concurrency)
// - No error handling strategy (Addressed with try-catch, UnrecoverableError, global retry config)
// - No retries for failed jobs (Addressed with defaultJobOptions)
// - No concurrency control (Addressed with concurrency option in @Processor)
@Processor('task-processing', {
  concurrency: 5,
})
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly mailerService: MailerService,
  ) {
    super();
  }

  // --- Worker Event Listeners for improved observability ---
  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Job ${job.id} of type ${job.name} started processing.`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: any) {
    this.logger.debug(
      `Job ${job.id} of type ${job.name} completed. Result: ${JSON.stringify(result)}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} of type ${job.name} failed with error: ${error.message}. Attempts made: ${job.attemptsMade}`,
      error.stack,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`Worker experienced an error: ${error.message}`, error.stack);
  }
  // --- End Worker Event Listeners ---

  // Refactored process method with structured error handling
  async process(job: Job): Promise<any> {
    this.logger.debug(
      `Processing job ${job.id} of type ${job.name}. Data: ${JSON.stringify(job.data)}`,
    );

    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);
        default:
          this.logger.warn(`Unknown job type received: ${job.name}. Job ID: ${job.id}`);
          // For unknown job types, it's typically an unrecoverable error
          throw new UnrecoverableError(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      const err = error as Error;

      // Catch specific errors and decide if they are retriable
      if (error instanceof UnrecoverableError) {
        this.logger.error(
          `Unrecoverable error processing job ${job.id} of type ${job.name}: ${error.message}`,
          error.stack,
        );
        // BullMQ will not retry UnrecoverableError, so re-throw it.
        throw error;
      } else {
        this.logger.error(
          `Error processing job ${job.id} of type ${job.name}: ${err.message}. Remaining attempts: ${job.attemptsMade}/${job.opts.attempts}`,
          err.stack,
        );
        // Re-throw to allow BullMQ's built-in retry mechanism to work for recoverable errors.
        throw error;
      }
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;
    this.logger.log(`Handling status update for task ${taskId} to status ${status}`);

    if (!taskId || !status) {
      this.logger.error(`Missing required data for task status update. Job ID: ${job.id}`);
      // Inefficient: Missing required data should be an unrecoverable error
      throw new UnrecoverableError('Missing required task ID or status for update.');
    }

    // Inefficient: No validation of status values (Addressed)
    // Validate status value against enum to prevent invalid states
    if (!Object.values(TaskStatus).includes(status)) {
      this.logger.error(`Invalid task status value: ${status}. Job ID: ${job.id}`);
      throw new UnrecoverableError(
        `Invalid task status value: "${status}". Must be one of: ${Object.values(TaskStatus).join(', ')}`,
      );
    }

    try {
      // No transaction handling (The tasksService.updateStatus is expected to handle database operations including transactions if necessary.)
      // No retry mechanism (Handled by global defaultJobOptions in @Processor)
      const updatedTask = await this.tasksService.updateStatus(taskId, status);
      this.logger.log(`Task ${taskId} status successfully updated to ${updatedTask.status}.`);
      return { success: true, taskId: updatedTask.id, newStatus: updatedTask.status };
    } catch (error) {
      const err = error as Error;

      this.logger.error(
        `Failed to update status for task ${taskId}: ${err.message}. Job ID: ${job.id}`,
        err.stack,
      );
      // Re-throw to trigger BullMQ retry mechanism for database or service level failures
      throw error;
    }
  }

  private async handleOverdueTasks(job: Job) {
    this.logger.debug('Processing overdue tasks notification.');

    const batchSize = 100;
    let offset = 0;
    let hasMoreTasks = true;
    let totalOverdueProcessed = 0;

    try {
      while (hasMoreTasks) {
        // Ensure that tasksService.findAll loads the 'user' relation to get email/name
        const overdueTasks = await this.tasksService.findAll({
          dueDateBefore: new Date().toISOString(),
          status: TaskStatus.PENDING,
          page: Math.floor(offset / batchSize) + 1,
          limit: batchSize,
        });

        if (overdueTasks.data.length === 0) {
          hasMoreTasks = false;
          break;
        }

        // --- Refactored: Directly send email for each overdue task ---
        for (const task of overdueTasks.data) {
          if (task.user && task.user.email) {
            try {
              const emailSubject = `Action Required: Your Task "${task.title}" is Overdue!`;
              const emailBody = `<p>Dear ${task.user.name || 'User'},</p>
                               <p>Your task <strong>"${task.title}"</strong> (ID: ${task.id}) was due on ${task.dueDate.toLocaleDateString()}.</p>
                               <p>Please log in to your dashboard to update its status</p>
                               <p>Thank you,</p>
                               <p>Your Task Management Team</p>`;

              await this.mailerService.sendMail({
                to: task.user.email,
                subject: emailSubject,
                html: emailBody,
              });
              this.logger.verbose(
                `Directly sent overdue email for task ${task.id} to ${task.user.email}`,
              );
            } catch (emailError) {
              const err = emailError as Error;
              this.logger.error(
                `Failed to send email directly for task ${task.id} to ${task.user.email}: ${err.message}`,
                err.stack,
              );
            }
          } else {
            this.logger.warn(
              `Task ${task.id} has no associated user or email for notification. Skipping email.`,
            );
          }
        }
        // --- End Refactored section ---

        totalOverdueProcessed += overdueTasks.data.length;
        this.logger.log(`Processed batch of ${overdueTasks.data.length} overdue tasks.`);

        if (overdueTasks.data.length < batchSize) {
          hasMoreTasks = false;
        } else {
          offset += batchSize;
        }
      }
      this.logger.log(
        `Finished processing overdue tasks. Total processed: ${totalOverdueProcessed}`,
      );
      return {
        success: true,
        message: `Overdue tasks processing completed. Total: ${totalOverdueProcessed}`,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error during overdue tasks processing job ${job.id}: ${err.message}`,
        err.stack,
      );
      // Re-throw to trigger BullMQ retry mechanism for processing failures
      throw error;
    }
  }
}
