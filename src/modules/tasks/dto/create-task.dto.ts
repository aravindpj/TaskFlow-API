import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

export class CreateTaskDto {
  @ApiProperty({ example: 'Complete project documentation' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Add details about API endpoints and data models',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    enum: TaskStatus,
    example: TaskStatus.PENDING,
    required: false,
  })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({
    enum: TaskPriority,
    example: TaskPriority.MEDIUM,
    required: false,
  })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({ example: '2023-12-31T23:59:59Z', required: false })
  @IsDateString()
  @IsOptional()
  dueDate?: Date;

  // Removed userId from here. It will be derived from the authenticated user.
  // If an admin needs to create tasks for other users, a separate endpoint/DTO could be considered.
}
