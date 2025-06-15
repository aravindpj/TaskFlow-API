import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ClassSerializerInterceptor,
  UseInterceptors,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path
import { ApiBearerAuth, ApiTags, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UserResponseDto } from './dto/user-response.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { PaginatedResponseDto } from '@common/decorators/pagination.dto';
import { Request } from 'express'; // Import Request from express

interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@ApiTags('users')
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard) // Apply JwtAuthGuard and RolesGuard globally for the controller
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('admin') // Only admins can create users via this endpoint (e.g., for internal management)
  @ApiBearerAuth()
  @ApiResponse({ status: 201, type: UserResponseDto })
  async create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles('admin') // Only admins can list all users
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'email', required: false, type: String })
  @ApiQuery({ name: 'name', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String })
  @ApiResponse({ status: 200, type: PaginatedResponseDto<UserResponseDto> })
  async findAll(@Query() queryDto: QueryUserDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.usersService.findAll(queryDto);
  }

  @Get(':id')
  // Users can get their own profile, admins can get any profile
  @ApiBearerAuth()
  @ApiResponse({ status: 200, type: UserResponseDto })
  async findOne(@Param('id') id: string, @Req() req: RequestWithUser): Promise<UserResponseDto> {
    // Check if the requesting user is trying to access their own profile OR is an admin
    if (req.user.id !== id && req.user.role !== 'admin') {
      throw new ForbiddenException('You are not authorized to view this user profile.');
    }
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  // Users can update their own profile, admins can update any profile
  @ApiBearerAuth()
  @ApiResponse({ status: 200, type: UserResponseDto })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: RequestWithUser,
  ): Promise<UserResponseDto> {
    // Check if the requesting user is trying to update their own profile OR is an admin
    if (req.user.id !== id && req.user.role !== 'admin') {
      throw new ForbiddenException('You are not authorized to update this user profile.');
    }
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiResponse({ status: 204, description: 'User successfully deleted' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
