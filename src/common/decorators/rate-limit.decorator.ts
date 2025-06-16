import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_KEY, RateLimitOptions } from '@common/guards/rate-limit.guard';
// Problem: This decorator doesn't actually enforce rate limiting
// It only sets metadata that is never used by the guard
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
