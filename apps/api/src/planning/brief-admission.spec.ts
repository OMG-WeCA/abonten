import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ExecutionContext } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { lastValueFrom, NEVER, throwError } from 'rxjs';
import { BriefExtractionService } from './brief-extraction.service';
import { BriefAdmissionInterceptor, type BriefUploadRequest } from './brief-admission.interceptor';

const synthetic = {
  originalname: 'synthetic.txt',
  buffer: Buffer.from('SYNTHETIC recovery brief'),
};
const hasStatus = (status: number) => (error: unknown) =>
  error instanceof Error &&
  'getStatus' in error &&
  typeof error.getStatus === 'function' &&
  error.getStatus() === status;

function httpFixture(ended = false) {
  const req = Object.assign(new EventEmitter(), {
    readableEnded: ended,
    destroyed: false,
    aborted: false,
    destroy() {
      this.destroyed = true;
      return this;
    },
  });
  const res = Object.assign(new EventEmitter(), { writableEnded: false, destroyed: false });
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return {
    req: req as typeof req & Pick<BriefUploadRequest, 'briefAdmission' | 'briefAbortSignal'>,
    res,
    context,
  };
}
function assertFullCapacityRestored(service: BriefExtractionService) {
  const first = service.reserve();
  const second = service.reserve();
  assert.throws(() => service.reserve(), hasStatus(429));
  service.release(first);
  service.release(first);
  service.release(second);
}

class DelayedCloseService extends BriefExtractionService {
  readonly worker = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    signals: [] as string[],
    kill(signal: string) {
      this.signals.push(signal);
      return true;
    },
  });
  protected override spawnParser(): ChildProcessWithoutNullStreams {
    // Test double models exactly the pipes/events used by the production runner.
    return this.worker as unknown as ChildProcessWithoutNullStreams;
  }
}

test('capacity is rejected before calling the next interceptor or buffering any body', async () => {
  const service = new BriefExtractionService();
  const first = service.reserve();
  const second = service.reserve();
  const { context, req } = httpFixture();
  let nextCalls = 0;
  const result = new BriefAdmissionInterceptor(service).intercept(context, {
    handle: () => {
      nextCalls++;
      return NEVER;
    },
  });
  await assert.rejects(lastValueFrom(result), hasStatus(429));
  assert.equal(nextCalls, 0);
  assert.equal(req.briefAdmission, undefined);
  service.release(first);
  service.release(second);
  assertFullCapacityRestored(service);
});

test('Multer/validation errors remain unchanged and release an unused admission', async () => {
  const service = new BriefExtractionService();
  const { context, req } = httpFixture(true);
  const error = new BadRequestException('Synthetic invalid multipart document');
  await assert.rejects(
    lastValueFrom(
      new BriefAdmissionInterceptor(service).intercept(context, {
        handle: () => throwError(() => error),
      }),
    ),
    (received) => received === error,
  );
  assert.equal(req.briefAdmission, undefined);
  assert.equal(req.briefAbortSignal, undefined);
  assertFullCapacityRestored(service);
});

test('upload disconnect aborts the request signal, stops buffering and allows deliberate retry', async () => {
  const service = new BriefExtractionService();
  const { context, req } = httpFixture();
  const outcome = lastValueFrom(
    new BriefAdmissionInterceptor(service).intercept(context, { handle: () => NEVER }),
  );
  const signal = req.briefAbortSignal!;
  const rejected = assert.rejects(outcome, hasStatus(499));
  req.aborted = true;
  req.emit('aborted');
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(req.destroyed, true);
  assertFullCapacityRestored(service);
});

test('upload deadline is 20 seconds, terminates an incomplete body and restores capacity', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const service = new BriefExtractionService();
  const { context, req } = httpFixture();
  const outcome = lastValueFrom(
    new BriefAdmissionInterceptor(service).intercept(context, { handle: () => NEVER }),
  );
  const rejected = assert.rejects(outcome, hasStatus(408));
  t.mock.timers.tick(19999);
  assert.equal(req.destroyed, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(req.destroyed, true);
  assertFullCapacityRestored(service);
});

test('completed upload clears its body deadline while processing remains subscribed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const service = new BriefExtractionService();
  const { context, req } = httpFixture();
  let errored = false;
  const subscription = new BriefAdmissionInterceptor(service)
    .intercept(context, { handle: () => NEVER })
    .subscribe({
      error: () => {
        errored = true;
      },
    });
  req.readableEnded = true;
  req.emit('end');
  t.mock.timers.tick(20000);
  assert.equal(errored, false);
  assert.equal(req.destroyed, false);
  subscription.unsubscribe();
  assertFullCapacityRestored(service);
});

test('abort sends SIGKILL but capacity stays reserved until child close', async () => {
  const service = new DelayedCloseService();
  const admission = service.reserve();
  const other = service.reserve();
  const abort = new AbortController();
  const extraction = service.extract(synthetic, admission, abort.signal);
  const rejected = assert.rejects(extraction, hasStatus(499));
  abort.abort();
  service.release(admission);
  assert.deepEqual(service.worker.signals, ['SIGKILL']);
  assert.throws(() => service.reserve(), hasStatus(429));
  let settled = false;
  void extraction.catch(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  service.worker.emit('close', null);
  await rejected;
  service.release(other);
  assertFullCapacityRestored(service);
});

test('15-second parser deadline preserves its legitimate error and waits for child cleanup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const service = new DelayedCloseService();
  const admission = service.reserve();
  const other = service.reserve();
  const extraction = service.extract(synthetic, admission);
  const rejected = assert.rejects(extraction, /Document extraction timed out/);
  t.mock.timers.tick(14999);
  assert.equal(service.worker.signals.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(service.worker.signals, ['SIGKILL']);
  service.release(admission);
  assert.throws(() => service.reserve(), hasStatus(429));
  service.worker.emit('close', null);
  await rejected;
  service.release(other);
  assertFullCapacityRestored(service);
});

test('HTTP cancellation during parsing propagates abort and holds the admission until worker close', async () => {
  const service = new DelayedCloseService();
  const { context, req, res } = httpFixture(true);
  let workerResult: Promise<unknown> | undefined;
  const outcome = lastValueFrom(
    new BriefAdmissionInterceptor(service).intercept(context, {
      handle: () => {
        workerResult = service
          .extract(synthetic, req.briefAdmission, req.briefAbortSignal)
          .catch((error) => error);
        return NEVER;
      },
    }),
  );
  const other = service.reserve();
  const rejected = assert.rejects(outcome, hasStatus(499));
  res.emit('close');
  await rejected;
  assert.deepEqual(service.worker.signals, ['SIGKILL']);
  assert.throws(() => service.reserve(), hasStatus(429));
  service.worker.emit('close', null);
  await workerResult;
  service.release(other);
  assertFullCapacityRestored(service);
});

test('real active worker dies on cancellation and the same service parses a manual retry', async () => {
  class RealWorkerService extends BriefExtractionService {
    slow = true;
    worker?: ChildProcessWithoutNullStreams;
    protected override spawnParser(format: string) {
      this.worker = this.slow
        ? spawn(process.execPath, ['-e', 'process.stdin.resume();setInterval(()=>{},1000)'], {
            env: {},
            stdio: ['pipe', 'pipe', 'pipe'],
          })
        : super.spawnParser(format);
      return this.worker;
    }
  }
  const service = new RealWorkerService();
  const abort = new AbortController();
  const extraction = service.extract(synthetic, undefined, abort.signal);
  const pid = service.worker!.pid!;
  const rejected = assert.rejects(extraction, hasStatus(499));
  abort.abort();
  await rejected;
  assert.throws(
    () => process.kill(pid, 0),
    (error: NodeJS.ErrnoException) => error.code === 'ESRCH',
  );
  service.slow = false;
  assert.equal((await service.extract(synthetic)).text, 'SYNTHETIC recovery brief');
  assertFullCapacityRestored(service);
});

test('pre-aborted, invalid and reused admissions never leak slots or start a worker', async () => {
  const service = new DelayedCloseService();
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(service.extract(synthetic, undefined, abort.signal), hasStatus(499));
  const expired = service.reserve();
  service.release(expired);
  await assert.rejects(service.extract(synthetic, expired), /admission has expired/);
  await assert.rejects(
    service.extract({ originalname: 'unsupported.ppt', buffer: Buffer.from('SYNTHETIC') }),
    /Legacy/,
  );
  assert.equal(service.worker.listenerCount('close'), 0);
  assertFullCapacityRestored(service);
});
