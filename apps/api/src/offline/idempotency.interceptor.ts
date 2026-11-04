import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';

/**
 * IdempotencyInterceptor — reads the X-Client-Operation-Id header (FR-OFF-03, NFR-11)
 * and attaches it to the request body as `clientOperationId` if the body is an object
 * and the field isn't already set.
 *
 * This means any controller that accepts a `clientOperationId` in its DTO
 * automatically benefits from the header-based offline retry mechanism
 * without each controller needing to read it manually.
 *
 * The header name X-Client-Operation-Id is distinct from X-Idempotency-Key
 * (which is already used for service-request creation) to avoid collision.
 * Both are supported — the interceptor checks both and prefers X-Client-Operation-Id.
 *
 * Apply globally in main.ts or in the AppModule via APP_INTERCEPTOR.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();

    // Only apply to mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next.handle();
    }

    const operationIdHeader =
      (req.headers['x-client-operation-id'] as string | undefined) ??
      (req.headers['x-idempotency-key'] as string | undefined);

    if (operationIdHeader && req.body && typeof req.body === 'object') {
      const body = req.body as Record<string, unknown>;
      // Inject into the body without overwriting an explicitly provided value
      if (!body['clientOperationId'] && !body['idempotencyKey']) {
        body['clientOperationId'] = operationIdHeader;
      }
    }

    return next.handle();
  }
}
