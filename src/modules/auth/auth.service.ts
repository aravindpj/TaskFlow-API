import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<{
    access_token: string;
    user: { id: string; email: string; role: string };
  }> {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const access_token = this.jwtService.sign(tokenPayload);

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto): Promise<{
    access_token: string;
    user: { id: string; email: string; name: string; role: string };
  }> {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Securely hash the password before storing (if not handled inside service)
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    const access_token = this.generateToken(user.id, user.email, user.role);

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  private generateToken(userId: string, email?: string, role?: string): string {
    const payload = { sub: userId, email, role };
    return this.jwtService.sign(payload, {
      expiresIn: '1h', // optional override
    });
  }

  async validateUser(userId: string) {
    return (await this.usersService.findOne(userId)) ?? null;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    return user ? requiredRoles.includes(user.role) : false;
  }
}
