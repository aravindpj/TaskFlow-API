import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Check if this is an HTTP request context
    if (context.getType() !== 'http') {
      // For non-HTTP contexts (e.g., WebSockets, RPC), skip enhanced logging
      return next.handle();
    }

    // Get HTTP request and response objects
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest();
    const res = httpContext.getResponse();

    // Extract request details
    const method = req.method;
    const url = req.originalUrl; // Full URL including path parameters
    const userAgent = req.headers['user-agent'] || '';
    const clientIp = req.ip; // Client IP address
    const userId = req.user?.id || 'anonymous'; // Extracts user ID if authenticated

    // Start timer for response duration
    const requestStart = Date.now();

    // Log incoming request with contextual information
    this.logger.log(
      `Incoming Request: ${method} ${url} | Client: ${clientIp} | Agent: ${userAgent} | UserID: ${userId}`,
    );

    // Set up response finish event listener
    res.on('finish', () => {
      const responseDuration = Date.now() - requestStart;
      const statusCode = res.statusCode;
      const contentLength = res.getHeader('content-length') || 0;

      // Log response completion details
      this.logger.log(
        `Outgoing Response: ${method} ${url} | Status: ${statusCode} | Duration: ${responseDuration}ms | Length: ${contentLength} bytes`,
      );
    });

    return next.handle().pipe(
      tap({
        error: err => {
          // Log errors with stack trace in development mode
          const errorDuration = Date.now() - requestStart;
          this.logger.error(
            `Request Error: ${method} ${url} | Status: ${err.status || 500} | Duration: ${errorDuration}ms`,
            err.stack, // Stack trace provides better debugging
          );
        },
      }),
    );
  }
}
