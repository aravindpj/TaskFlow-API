// src/tasks/dto/batch-task.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsString, ArrayNotEmpty } from 'class-validator';

export enum BatchAction {
  COMPLETE = 'complete',
  DELETE = 'delete',
}

export class BatchTaskDto {
  @ApiProperty({
    example: ['123e4567-e89b-12d3-a456-426614174000', '456e7890-e12b-12d3-a456-426614174000'],
    description: 'Array of task IDs to perform the batch operation on.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Task IDs array cannot be empty.' })
  @IsString({ each: true }) // Ensure each element in the array is a string
  @IsNotEmpty({ each: true }) // Ensure each string in the array is not empty
  taskIds: string[];

  @ApiProperty({
    example: BatchAction.COMPLETE,
    description: 'The action to perform on the tasks (complete or delete).',
    enum: BatchAction,
  })
  @IsEnum(BatchAction, { message: 'Action must be either "complete" or "delete".' })
  @IsNotEmpty()
  action: BatchAction;
}
