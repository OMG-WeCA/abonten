import { HttpException, Injectable, RequestTimeoutException } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, type Subscription } from 'rxjs';
import { BriefExtractionService, type BriefAdmission } from './brief-extraction.service';

export type BriefUploadRequest = Request & {
  briefAdmission?: BriefAdmission;
  briefAbortSignal?: AbortSignal;
};

/** Must precede FileInterceptor: reserve capacity before body buffering begins.
 * Authentication and capability guards still execute before this interceptor. */
@Injectable()
export class BriefAdmissionInterceptor implements NestInterceptor {
  constructor(private readonly briefs: BriefExtractionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<BriefUploadRequest>();
    const res = http.getResponse<Response>();
    return new Observable((observer) => {
      // No next.handle(), Multer callback or uploaded bytes before admission.
      const admission = this.briefs.reserve();
      const abort = new AbortController();
      req.briefAdmission = admission;
      req.briefAbortSignal = abort.signal;
      let subscription: Subscription | undefined;
      let stopping = false;
      const uploadFinished = () => clearTimeout(uploadDeadline);
      const stop = (error: HttpException) => {
        if (stopping || observer.closed) return;
        stopping = true;
        abort.abort();
        // Abort Multer's stream rather than leaving an unsubscribed bufferer
        // running. An unfinished timed-out upload closes its HTTP connection.
        if (!req.readableEnded && !req.destroyed) req.destroy();
        observer.error(error);
      };
      const cancelled = () =>
        stop(new HttpException('Document upload cancelled. Retry manually.', 499));
      const responseClosed = () => {
        if (!res.writableEnded) cancelled();
      };
      const uploadDeadline = setTimeout(
        () =>
          stop(
            new RequestTimeoutException(
              'Document upload timed out. Retry a smaller file manually.',
            ),
          ),
        20000,
      );
      req.once('end', uploadFinished);
      req.once('aborted', cancelled);
      req.once('error', cancelled);
      res.once('close', responseClosed);
      if (req.readableEnded) uploadFinished();
      if (req.aborted || req.destroyed || res.destroyed) cancelled();
      else {
        try {
          subscription = next.handle().subscribe({
            next: (value) => observer.next(value),
            error: (error: unknown) => observer.error(error),
            complete: () => observer.complete(),
          });
        } catch (error) {
          observer.error(error);
        }
      }
      return () => {
        clearTimeout(uploadDeadline);
        req.off('end', uploadFinished);
        req.off('aborted', cancelled);
        req.off('error', cancelled);
        res.off('close', responseClosed);
        abort.abort();
        if (!req.readableEnded && !req.destroyed) req.destroy();
        subscription?.unsubscribe();
        this.briefs.release(admission);
        delete req.briefAdmission;
        delete req.briefAbortSignal;
      };
    });
  }
}
