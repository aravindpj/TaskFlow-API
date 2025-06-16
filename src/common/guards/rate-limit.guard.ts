import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import * as crypto from 'crypto';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private redis: Redis;
  private hashSecret: string;

  constructor(private reflector: Reflector) {
    this.hashSecret = process.env.RATE_LIMIT_HASH_SECRET || '';

    if (!this.hashSecret) {
      throw new Error('RATE_LIMIT_HASH_SECRET environment variable is not set');
    }

    this.initializeRedis();
  }

  private initializeRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = new Redis(redisUrl);

      this.redis.on('connect', () => {
        this.logger.log(`Connected to Redis at ${redisUrl}`);
      });

      this.redis.on('error', err => {
        this.logger.error(`Redis connection error: ${err.message}`);
      });
    } catch (err) {
      this.logger.error('Redis initialization failed', err instanceof Error ? err.stack : '');
      throw err;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();

      // FIXED: Proper metadata retrieval using getAllAndOverride
      const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (!options) {
        this.logger.debug('No rate limit options found, skipping');
        return true;
      }

      const { limit, windowMs } = options;
      const identifier = this.getIdentifier(request);
      const key = this.generateKey(context, identifier);

      this.logger.debug(`Applying rate limit: ${limit} req/${windowMs}ms to ${key}`);

      // Pass context to handleRateLimit
      return this.handleRateLimit(context, key, limit, windowMs);
    } catch (err) {
      this.logger.error(
        `Rate limit error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      return true; // Fail open
    }
  }

  private getIdentifier(req: any): string {
    const ip = req.ip || req.connection?.remoteAddress || '';
    return crypto.createHmac('sha256', this.hashSecret).update(ip).digest('hex');
  }

  private generateKey(context: ExecutionContext, identifier: string): string {
    const className = context.getClass().name;
    const handlerName = context.getHandler().name;
    return `rate_limit:${identifier}:${className}:${handlerName}`;
  }

  private async handleRateLimit(
    context: ExecutionContext,
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    try {
      const now = Date.now();
      const transaction = this.redis.multi();

      transaction.zadd(key, now, `${now}-${Math.random()}`);
      transaction.zremrangebyscore(key, 0, now - windowMs);
      transaction.zcard(key);
      transaction.expire(key, Math.ceil(windowMs / 1000) + 10); // Extra 10s buffer

      const results = await transaction.exec();

      if (!results) {
        this.logger.warn('Redis transaction returned no results');
        return true;
      }

      const zcardResult = results[2];
      if (!zcardResult || zcardResult.length < 2) {
        this.logger.error('Invalid Redis zcard result');
        return true;
      }

      const currentCount = Number(zcardResult[1]);
      const remaining = Math.max(0, limit - currentCount);

      this.logger.debug(`Rate limit: ${currentCount}/${limit} requests, ${remaining} remaining`);

      // Get response from context
      const response = context.switchToHttp().getResponse();

      // Set rate limit headers
      response.setHeader('X-RateLimit-Limit', limit);
      response.setHeader('X-RateLimit-Remaining', remaining);
      response.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));

      if (currentCount > limit) {
        throw new HttpException(
          {
            status: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Rate limit exceeded',
            limit,
            window: `${windowMs / 1000} seconds`,
            remaining: 0,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `Redis operation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      return true;
    }
  }
}
