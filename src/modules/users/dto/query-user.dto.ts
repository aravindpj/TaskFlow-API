import { PaginationDto } from '@common/decorators/pagination.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryUserDto extends PaginationDto {
  @ApiProperty({
    description: 'Filter by user email (partial match)',
    example: 'john',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    description: 'Filter by user name (partial match)',
    example: 'doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Filter by user role',
    example: 'user',
    required: false,
  })
  @IsOptional()
  @IsString()
  role?: string;
}
