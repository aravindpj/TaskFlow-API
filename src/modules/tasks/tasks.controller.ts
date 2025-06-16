import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  ClassSerializerInterceptor,
  Req,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, ApiResponse } from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'; // Adjust path
import { RateLimit } from '../../common/decorators/rate-limit.decorator'; // Adjust path
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path
import { TaskResponseDto } from './dto/task-response.dto'; // Adjust path
import { Request } from 'express'; // Import Request from express
import { TaskFilterDto } from './dto/task-filter.dto';
import { PaginatedResponseDto } from '@common/decorators/pagination.dto';
import { TaskPriority } from './enums/task-priority.enum';
import { BatchAction, BatchTaskDto } from './dto/batch-task.dto';

// Extend Request type to include user details from JwtAuthGuard
interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    role: string;
    // Add other user properties from your JWT payload if needed
  };
}

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard) // Apply JwtAuthGuard and RateLimitGuard globally for the controller
@RateLimit({ limit: 20, windowMs: 60000 }) // Example rate limit
@ApiBearerAuth()
@UseInterceptors(ClassSerializerInterceptor) // Ensures DTO transformations are applied
export class TasksController {
  constructor(private readonly tasksService: TasksService) {} // Removed direct repository injection

  @Post()
  @ApiOperation({ summary: 'Create a new task for the authenticated user' })
  @ApiResponse({ status: 201, type: TaskResponseDto })
  async create(
    @Body() createTaskDto: CreateTaskDto,
    @Req() req: RequestWithUser,
  ): Promise<TaskResponseDto> {
    console.log('API HIT HAPPENING');
    return this.tasksService.create(createTaskDto, req.user.id); // Associate task with authenticated user
  }

  @Get()
  // Example rate limit
  @ApiOperation({ summary: 'List tasks with filtering and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'title', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: TaskStatus })
  @ApiQuery({ name: 'priority', required: false, enum: TaskPriority })
  @ApiQuery({ name: 'dueDateBefore', required: false, type: String })
  @ApiQuery({ name: 'dueDateAfter', required: false, type: String })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'Filter by user ID (admin only)',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto<TaskResponseDto> })
  async findAll(
    @Query() queryDto: TaskFilterDto,
    @Req() req: RequestWithUser,
  ): Promise<PaginatedResponseDto<TaskResponseDto>> {
    const isAdmin = req.user.role === 'admin';
    // If a non-admin user tries to query for another userId, forbid it.
    if (!isAdmin && queryDto.userId && queryDto.userId !== req.user.id) {
      throw new ForbiddenException('You are not authorized to query tasks for other users.');
    }
    // If not admin and no userId is specified in query, default to logged-in user's tasks
    if (!isAdmin && !queryDto.userId) {
      queryDto.userId = req.user.id;
    }

    return this.tasksService.findAll(queryDto, req.user.id, isAdmin);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get task statistics for the authenticated user (or all tasks for admin)',
  })
  @ApiResponse({ status: 200 })
  async getStats(@Req() req: RequestWithUser) {
    const isAdmin = req.user.role === 'admin';
    return this.tasksService.getTaskStatistics(req.user.id, isAdmin);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  async findOne(@Param('id') id: string, @Req() req: RequestWithUser): Promise<TaskResponseDto> {
    const isAdmin = req.user.role === 'admin';
    return this.tasksService.findOne(id, req.user.id, isAdmin);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  async update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @Req() req: RequestWithUser,
  ): Promise<TaskResponseDto> {
    const isAdmin = req.user.role === 'admin';
    return this.tasksService.update(id, updateTaskDto, req.user.id, isAdmin);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  @HttpCode(HttpStatus.NO_CONTENT) // Return 204 No Content on successful deletion
  @ApiResponse({ status: 204, description: 'Task successfully deleted' })
  async remove(@Param('id') id: string, @Req() req: RequestWithUser): Promise<void> {
    const isAdmin = req.user.role === 'admin';
    await this.tasksService.remove(id, req.user.id, isAdmin);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks (complete or delete)' })
  @ApiResponse({ status: 200, description: 'Batch operation results' })
  @ApiResponse({ status: 400, description: 'Invalid batch action or empty task IDs' })
  async batchProcess(
    @Body() operations: BatchTaskDto, // Use the new DTO here
    @Req() req: RequestWithUser,
  ): Promise<any> {
    const { taskIds, action } = operations;
    // Validation for taskIds array is now handled by class-validator on BatchTaskDto

    const isAdmin = req.user.role === 'admin';

    switch (action) {
      case BatchAction.COMPLETE: // Use the enum
        return this.tasksService.batchUpdateStatus(
          taskIds,
          TaskStatus.COMPLETED, // Use TaskStatus enum
          req.user.id,
          isAdmin,
        );
      case BatchAction.DELETE: // Use the enum
        return this.tasksService.batchDelete(taskIds, req.user.id, isAdmin);
      default:
        throw new BadRequestException(`Unknown batch action: ${action}`);
    }
  }
}
