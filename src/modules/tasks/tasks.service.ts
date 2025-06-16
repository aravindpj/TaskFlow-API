import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException, // Added BadRequestException as it's used in create method logic
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between, In } from 'typeorm'; // Added 'In' for batch operations
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskResponseDto } from './dto/task-response.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { PaginatedResponseDto } from '@common/decorators/pagination.dto';
import { TaskPriority } from './enums/task-priority.enum';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<TaskResponseDto> {
    this.logger.log(`Attempting to create task for user: ${userId}`);
    // Use transaction to ensure consistency between DB and Queue
    return await this.tasksRepository.manager.transaction(async transactionalEntityManager => {
      const task = transactionalEntityManager.create(Task, {
        ...createTaskDto,
        userId: userId, // Assign userId from authenticated user
      });
      const savedTask = await transactionalEntityManager.save(task);

      // Add to queue and await completion for reliability
      await this.taskQueue.add(
        'task-status-update',
        {
          taskId: savedTask.id,
          status: savedTask.status,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }, // Add retry mechanism
      );
      this.logger.log(`Task created and queued successfully: ${savedTask.id}`);
      return new TaskResponseDto(savedTask);
    });
  }

  async findAll(
    queryDto: TaskFilterDto, // Changed from TaskFilterDto to TaskFilterDto
    loggedInUserId?: string,
    isAdmin: boolean = false,
  ): Promise<PaginatedResponseDto<TaskResponseDto>> {
    this.logger.log(
      `Fetching tasks with query: ${JSON.stringify(queryDto)} for user: ${loggedInUserId || 'N/A'} (Admin: ${isAdmin})`,
    );
    // Ensure page and limit are correctly parsed as numbers and use sensible defaults
    const pageNumber = Number(queryDto.page) || 1;
    const limitNumber = Number(queryDto.limit) || 10; // Default to 10, not 2
    const skip = (pageNumber - 1) * limitNumber;

    const { title, status, priority, dueDateBefore, dueDateAfter, userId } = queryDto;

    const where: any = {}; // TypeORM WhereCondition for query
    if (title) {
      where.title = Like(`%${title}%`);
    }
    if (status) {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }
    if (dueDateBefore && dueDateAfter) {
      where.dueDate = Between(new Date(dueDateAfter), new Date(dueDateBefore));
    } else if (dueDateBefore) {
      where.dueDate = Between(new Date('1900-01-01'), new Date(dueDateBefore)); // Tasks before a certain date
    } else if (dueDateAfter) {
      where.dueDate = Between(new Date(dueDateAfter), new Date('2100-01-01')); // Tasks after a certain date
    }

    // Apply ownership filter unless admin or specific userId is requested by admin
    if (!isAdmin) {
      where.userId = loggedInUserId; // Only show tasks for the logged-in user
    } else if (userId) {
      where.userId = userId; // Admin can filter by any user's ID
    }

    const [tasks, total] = await this.tasksRepository.findAndCount({
      where,
      relations: ['user'], // Eager load user to prevent N+1 if user details are needed in response
      skip,
      take: limitNumber,
      order: { createdAt: 'DESC' }, // Default sorting
    });

    this.logger.log(`Found ${tasks.length} tasks out of ${total} total.`);
    const taskResponseDtos = tasks.map(task => new TaskResponseDto(task));
    return new PaginatedResponseDto(taskResponseDtos, total, pageNumber, limitNumber);
  }

  // This method now returns a Task entity for internal service use
  async findOne(id: string, loggedInUserId?: string, isAdmin: boolean = false): Promise<Task> {
    // Return type changed to Task
    this.logger.log(
      `Fetching task with ID: ${id} for user: ${loggedInUserId || 'N/A'} (Admin: ${isAdmin})`,
    );
    const whereCondition: any = { id };

    if (!isAdmin) {
      whereCondition.userId = loggedInUserId;
    }

    const task = await this.tasksRepository.findOne({
      where: whereCondition,
      relations: ['user'], // Eager load user
    });

    if (!task) {
      this.logger.warn(`Task with ID ${id} not found or not accessible.`);
      throw new NotFoundException(`Task with ID ${id} not found or you do not have access.`);
    }
    this.logger.log(`Task found: ${task.id}`);
    return task; // Return the Task entity directly
  }

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    loggedInUserId: string,
    isAdmin: boolean = false,
  ): Promise<TaskResponseDto> {
    this.logger.log(`Updating task with ID: ${id} for user: ${loggedInUserId} (Admin: ${isAdmin})`);
    // findOne now correctly returns a Task entity
    const task: Task = await this.findOne(id, loggedInUserId, isAdmin);

    const originalStatus = task.status;

    // Use merge for efficient partial updates
    this.tasksRepository.merge(task, updateTaskDto);
    const updatedTask = await this.tasksRepository.save(task);

    // Add to queue if status changed, with retry
    if (originalStatus !== updatedTask.status) {
      this.logger.log(`Task status changed. Adding job to queue: ${updatedTask.id}`);
      await this.taskQueue.add(
        'task-status-update',
        {
          taskId: updatedTask.id,
          status: updatedTask.status,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
    }
    this.logger.log(`Task updated successfully: ${updatedTask.id}`);
    return new TaskResponseDto(updatedTask); // Map to DTO before returning to controller
  }

  async remove(id: string, loggedInUserId: string, isAdmin: boolean = false): Promise<void> {
    this.logger.log(
      `Attempting to remove task with ID: ${id} for user: ${loggedInUserId} (Admin: ${isAdmin})`,
    );
    const task = await this.findOne(id, loggedInUserId, isAdmin); // Re-use findOne for ownership check (returns Task)
    await this.tasksRepository.delete(task.id); // Use delete for single database call
    this.logger.log(`Task removed successfully: ${id}`);
  }

  async getTaskStatistics(loggedInUserId?: string, isAdmin: boolean = false): Promise<any> {
    this.logger.log(
      `Getting task statistics for user: ${loggedInUserId || 'N/A'} (Admin: ${isAdmin})`,
    );
    const queryBuilder = this.tasksRepository.createQueryBuilder('task');

    if (!isAdmin && loggedInUserId) {
      queryBuilder.andWhere('task.userId = :userId', { userId: loggedInUserId });
    }

    const total = await queryBuilder.getCount();

    // Group by status and get counts
    const statusStats = await queryBuilder
      .select('task.status', 'status')
      .addSelect('COUNT(task.id)', 'count')
      .groupBy('task.status')
      .getRawMany();

    // Group by priority and get counts
    const priorityStats = await queryBuilder
      .select('task.priority', 'priority')
      .addSelect('COUNT(task.id)', 'count')
      .groupBy('task.priority')
      .getRawMany();

    const statistics = {
      total,
      completed: statusStats.find(s => s.status === TaskStatus.COMPLETED)?.count || 0,
      inProgress: statusStats.find(s => s.status === TaskStatus.IN_PROGRESS)?.count || 0,
      pending: statusStats.find(s => s.status === TaskStatus.PENDING)?.count || 0,
      highPriority: priorityStats.find(p => p.priority === TaskPriority.HIGH)?.count || 0,
      mediumPriority: priorityStats.find(p => p.priority === TaskPriority.MEDIUM)?.count || 0,
      lowPriority: priorityStats.find(p => p.priority === TaskPriority.LOW)?.count || 0,
    };
    this.logger.log(`Task statistics generated.`);
    return statistics;
  }

  async batchUpdateStatus(
    taskIds: string[],
    newStatus: TaskStatus,
    loggedInUserId: string,
    isAdmin: boolean = false,
  ): Promise<{ updated: number; failed: number }> {
    this.logger.log(
      `Batch updating status to ${newStatus} for tasks: ${taskIds.join(', ')} for user: ${loggedInUserId} (Admin: ${isAdmin})`,
    );

    const whereCondition: any = { id: In(taskIds) };
    if (!isAdmin) {
      whereCondition.userId = loggedInUserId;
    }

    const updateResult = await this.tasksRepository.update(whereCondition, { status: newStatus });

    // Enqueue jobs for each updated task if status changed (assuming external system needs notification)
    // For a large batch, you might consider a single job for the batch or a dedicated batch processor worker
    for (const taskId of taskIds) {
      // Potentially, fetch task before update to see if status actually changed
      // For simplicity here, we assume if it was updated by query, it changed
      this.taskQueue.add(
        'task-status-update',
        { taskId, status: newStatus },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
    }
    this.logger.log(`Batch status update completed. Affected: ${updateResult.affected}`);
    return {
      updated: updateResult.affected || 0,
      failed: taskIds.length - (updateResult.affected || 0),
    };
  }

  async batchDelete(
    taskIds: string[],
    loggedInUserId: string,
    isAdmin: boolean = false,
  ): Promise<{ deleted: number; failed: number }> {
    this.logger.log(
      `Batch deleting tasks: ${taskIds.join(', ')} for user: ${loggedInUserId} (Admin: ${isAdmin})`,
    );

    const whereCondition: any = { id: In(taskIds) };
    if (!isAdmin) {
      whereCondition.userId = loggedInUserId;
    }

    const deleteResult = await this.tasksRepository.delete(whereCondition);
    this.logger.log(`Batch delete completed. Affected: ${deleteResult.affected}`);
    return {
      deleted: deleteResult.affected || 0,
      failed: taskIds.length - (deleteResult.affected || 0),
    };
  }

  async updateStatus(id: string, status: TaskStatus): Promise<TaskResponseDto> {
    this.logger.log(`Updating status for task ${id} to ${status} (from worker)`);
    // This method is intended for the BullMQ worker to call, so no ownership check here.
    const task = await this.tasksRepository.findOne({ where: { id } });
    if (!task) {
      this.logger.error(`Task with ID ${id} not found during status update from worker.`);
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    task.status = status;
    const updatedTask = await this.tasksRepository.save(task);
    this.logger.log(`Task ${id} status updated to ${status} (from worker)`);
    return new TaskResponseDto(updatedTask);
  }
}
