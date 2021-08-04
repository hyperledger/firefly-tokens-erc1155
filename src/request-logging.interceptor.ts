import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestLogging');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request: Request = context.switchToHttp().getRequest();
    this.logRequest(request);
    return next.handle().pipe(
      tap(() => {
        const response: Response = context.switchToHttp().getResponse();
        this.logResponse(request, response.statusCode, response.statusMessage);
      }),
      catchError(error => {
        if ('getStatus' in error) {
          const httpError: HttpException = error;
          const response: Response = context.switchToHttp().getResponse();
          const statusCode = httpError.getStatus() ?? response.statusCode;
          const statusMessage = httpError.message;
          this.logResponse(request, statusCode, statusMessage);
        }
        return throwError(error);
      }),
    );
  }

  private logRequest(request: Request) {
    this.logger.log(`${request.method} ${request.originalUrl}`);
  }

  private logResponse(request: Request, statusCode: number, statusMessage: string) {
    if (statusCode >= 400) {
      this.logger.warn(`${request.method} ${request.originalUrl} - ${statusCode} ${statusMessage}`);
    }
  }
}
