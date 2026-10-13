import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma, TenantViolationError } from '@app/db';
import { SpreadsheetError } from '@app/core';

/** Maps domain / persistence errors to HTTP responses with a consistent `{ statusCode, message }` body. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(
        typeof body === 'string' ? { statusCode: exception.getStatus(), message: body } : body,
      );
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') [status, message] = [HttpStatus.NOT_FOUND, 'Resource not found'];
      else if (exception.code === 'P2002') [status, message] = [HttpStatus.CONFLICT, 'Resource already exists'];
    } else if (exception instanceof TenantViolationError) {
      [status, message] = [HttpStatus.FORBIDDEN, 'Cross-workspace access denied'];
    } else if (exception instanceof SpreadsheetError) {
      [status, message] = [HttpStatus.BAD_REQUEST, exception.message];
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(exception);
    res.status(status).json({ statusCode: status, message });
  }
}
