import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';
import { PaginationDto } from '@common/decorators/pagination.dto';
export class TaskFilterDto extends PaginationDto {
  @ApiProperty({
    description: 'Filter by task title (partial match)',
    example: 'documentation',
    required: false,
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: 'Filter by task status',
    enum: TaskStatus,
    example: TaskStatus.PENDING,
    required: false,
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiProperty({
    description: 'Filter by task priority',
    enum: TaskPriority,
    example: TaskPriority.HIGH,
    required: false,
  })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiProperty({
    description: 'Filter tasks due before this date (ISO 8601 string)',
    example: '2024-12-31T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dueDateBefore?: string;

  @ApiProperty({
    description: 'Filter tasks due after this date (ISO 8601 string)',
    example: '2024-01-01T00:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dueDateAfter?: string;

  @ApiProperty({
    description: 'Filter by associated user ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsString() // @IsUUID() might be too strict if used for 'all tasks' scenario
  userId?: string; // This will be used by admin or for self-filtering
}
