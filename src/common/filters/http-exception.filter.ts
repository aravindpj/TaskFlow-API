import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: HttpStatus;
    let message: string | string[];
    let errorDetails: string | object | null = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        message = (exceptionResponse as any).message;
        errorDetails = exceptionResponse;
      } else {
        message = exceptionResponse as string;
      }

      if (status >= 500) {
        this.logger.error(
          `HTTP 5xx Error: ${exception.message} - ${request.method} ${request.url}`,
          exception.stack,
          `Response: ${JSON.stringify(errorDetails || message)}`,
        );
      } else if (status >= 400) {
        this.logger.warn(
          `HTTP 4xx Error: ${exception.message} - ${request.method} ${request.url}`,
          `Response: ${JSON.stringify(errorDetails || message)}`,
        );
      } else {
        this.logger.log(
          `HTTP Exception: ${exception.message} - ${request.method} ${request.url}`,
          `Response: ${JSON.stringify(errorDetails || message)}`,
        );
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred.';
      errorDetails = { name: exception.name, message: exception.message };
      this.logger.error(
        `Critical Server Error: ${exception.message} - ${request.method} ${request.url}`,
        exception.stack,
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unknown error occurred.';
      this.logger.error(
        `Unknown Error Type: ${JSON.stringify(exception)} - ${request.method} ${request.url}`,
      );
    }

    const responseBody = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: message,
      error:
        errorDetails && typeof errorDetails === 'object' && 'error' in errorDetails
          ? (errorDetails as any).error
          : undefined,
      errors: Array.isArray(message) ? message : undefined,
    };

    if (responseBody.errors && responseBody.errors.length > 0) {
      responseBody.message = Array.isArray(message) ? message[0] : message;
    }

    response.status(status).json(responseBody);
  }
}
