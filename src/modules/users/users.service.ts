import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindManyOptions } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { QueryUserDto } from './dto/query-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { PaginatedResponseDto } from '@common/decorators/pagination.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    this.logger.log(`Attempting to create user with email: ${createUserDto.email}`);
    // Check if user with this email already exists
    const existingUser = await this.usersRepository.findOne({
      where: { email: createUserDto.email },
    });
    if (existingUser) {
      this.logger.warn(`User creation failed: Email already exists - ${createUserDto.email}`);
      throw new BadRequestException('User with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
    const savedUser = await this.usersRepository.save(user);
    this.logger.log(`User created successfully: ${savedUser.id}`);
    return new UserResponseDto(savedUser);
  }

  async findAll(queryDto: QueryUserDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    this.logger.log(`Fetching all users with query: ${JSON.stringify(queryDto)}`);

    const { page, limit, email, name, role } = queryDto;
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 2;
    const skip = (pageNumber - 1) * limitNumber;

    const where: FindManyOptions<User>['where'] = {};
    if (email) {
      where.email = Like(`%${email}%`);
    }
    if (name) {
      where.name = Like(`%${name}%`);
    }
    if (role) {
      where.role = role;
    }

    const [users, total] = await this.usersRepository.findAndCount({
      where,
      skip,
      take: limitNumber,
      order: { createdAt: 'DESC' },
    });

    this.logger.log(`Found ${users.length} users out of ${total} total.`);
    const userResponseDtos = users.map(user => new UserResponseDto(user));

    return new PaginatedResponseDto(userResponseDtos, total, pageNumber, limitNumber);
  }

  async findOne(id: string): Promise<UserResponseDto> {
    this.logger.log(`Fetching user with ID: ${id}`);
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      this.logger.warn(`User with ID ${id} not found.`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    this.logger.log(`User found: ${user.id}`);
    return new UserResponseDto(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    this.logger.log(`Fetching user by email: ${email}`);
    return this.usersRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    this.logger.log(`Updating user with ID: ${id}`);

    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (updateUserDto.password) {
      this.logger.log(`Hashing new password for user ID: ${id}`);
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const updatedUser = this.usersRepository.merge(user, updateUserDto);
    const savedUser = await this.usersRepository.save(updatedUser);

    this.logger.log(`User updated successfully: ${savedUser.id}`);

    return new UserResponseDto(savedUser);
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Attempting to remove user with ID: ${id}`);

    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      this.logger.warn(`User with ID ${id} not found`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.usersRepository.remove(user);
    this.logger.log(`User removed successfully: ${id}`);
  }
}
