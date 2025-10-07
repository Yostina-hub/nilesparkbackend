import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge } from 'prom-client';
import { Inject } from '@nestjs/common';
import * as client from 'prom-client';
type InspectOptions = {
  start?: number;
  end?: number;
  states?: Array<
    | 'waiting'
    | 'delayed'
    | 'active'
    | 'completed'
    | 'failed'
    | 'waiting-children'
  >;
  q?: string;
  verbose?: boolean;
};

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @InjectQueue('notification-dlq') private readonly dlqQueue: Queue,
    @InjectQueue('notification-queue') private readonly primaryQueue: Queue,
    @InjectMetric('notification_dlq_jobs')
    private readonly dlqGauge: Gauge<string>,
    @Inject('PROMETHEUS_REGISTRY')
    private readonly prometheusRegistry: client.Registry,
  ) {
    // super();
  }

  async inspectDlq(opts: InspectOptions = {}) {
    try {
      const {
        start = 0,
        end = 49,
        states = ['waiting'],
        q,
        verbose = false,
      } = opts;
      const jobs = await this.dlqQueue.getJobs(
        states as any,
        start,
        end,
        false,
      );

      const rows = await Promise.all(
        jobs.map(async (j) => {
          const meta = (j.data && (j.data as any).__dlq) || {};
          const base = {
            id: j.id,
            name: j.name,
            state: 'in-dlq' as const,
            to: (j.data as any)?.to,
            subject: (j.data as any)?.subject,
            originalJobId: meta.originalJobId,
            attemptsMade: meta.attemptsMade,
            failedReason: meta.failedReason,
            failedAt: meta.failedAt,
          };
          return verbose
            ? { ...base, data: j.data, returnValue: j.returnvalue }
            : base;
        }),
      );

      const filtered = q
        ? rows.filter((r: any) =>
            JSON.stringify(r).toLowerCase().includes(String(q).toLowerCase()),
          )
        : rows;

      return filtered;
    } catch (err: any) {
      this.logger.error(`Failed to inspect DLQ: ${err.message}`);
      return [];
    }
  }

  async reprocess(jobId: string) {
    try {
      const dlqJob = await this.dlqQueue.getJob(jobId);
      if (!dlqJob) return { ok: false, error: 'DLQ job not found' };

      const payload = { ...(dlqJob.data ?? {}) };
      delete (payload as any).__dlq;

      const newJob = await this.primaryQueue.add(dlqJob.name, payload, {
        jobId: `reproc:${jobId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      });

      await dlqJob.remove();
      this.logger.log(`DLQ job ${jobId} requeued as ${newJob.id}`);
      return { ok: true, requeuedAs: newJob.id };
    } catch (err: any) {
      this.logger.error(`Failed to reprocess DLQ job ${jobId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async reprocessMany(jobIds: string[], cap = 100) {
    try {
      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return { ok: false, error: 'No jobIds provided' };
      }
      const ids = jobIds.slice(0, cap);
      const results: ({ id: string } & (
        | { ok: boolean; requeuedAs: string | undefined; error?: undefined }
        | { ok: boolean; error: string; requeuedAs?: undefined }
      ))[] = [];
      for (const id of ids) {
        try {
          results.push({ id, ...(await this.reprocess(id)) });
        } catch (e: any) {
          results.push({
            id,
            ok: false,
            error: e?.message ?? 'reprocess failed',
          });
        }
      }
      return { ok: true, results, count: results.length };
    } catch (err: any) {
      this.logger.error(`Failed to reprocess many DLQ jobs: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async purge(jobIds: string[]) {
    try {
      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return { ok: false, error: 'No jobIds provided' };
      }
      const results: { id: string; ok: boolean; error?: string }[] = [];
      for (const id of jobIds) {
        const job = await this.dlqQueue.getJob(id);
        if (!job) {
          results.push({ id, ok: false, error: 'not found' });
          continue;
        }
        await job.remove();
        results.push({ id, ok: true });
      }
      return { ok: true, results, count: results.length };
    } catch (err: any) {
      this.logger.error(`Failed to purge DLQ jobs: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async stats() {
    try {
      const counts = await this.dlqQueue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
        'waiting-children',
      );
      Object.entries(counts).forEach(([state, count]) => {
        this.dlqGauge.set({ state }, count);
      });
      return { queue: this.dlqQueue.name, counts };
    } catch (err: any) {
      this.logger.error(`Failed to get DLQ stats: ${err.message}`);
      return { queue: this.dlqQueue.name, counts: {} };
    }
  }

  async reprocessAll(limit = 100) {
    try {
      const jobs = await this.dlqQueue.getJobs(
        ['waiting'],
        0,
        limit - 1,
        false,
      );
      const ids = jobs.map((j) => String(j.id));
      return await this.reprocessMany(ids, limit);
    } catch (err: any) {
      this.logger.error(`Failed to reprocess all DLQ jobs: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async debug() {
    try {
      const client: any =
        (this.dlqQueue as any).client ||
        (this.dlqQueue as any).opts?.connection;
      const prefix = (this.dlqQueue as any).opts?.prefix ?? 'bull';
      return {
        queue: this.dlqQueue.name,
        prefix,
        connection: {
          host:
            client?.options?.host ?? client?.connector?.options?.host ?? null,
          port:
            client?.options?.port ?? client?.connector?.options?.port ?? null,
          db: client?.options?.db ?? client?.connector?.options?.db ?? null,
          url: client?.options?.url ?? null,
        },
        counts: await this.dlqQueue.getJobCounts(
          'waiting',
          'failed',
          'completed',
          'active',
          'delayed',
        ),
      };
    } catch (err: any) {
      this.logger.error(`Failed to debug DLQ: ${err.message}`);
      return { queue: this.dlqQueue.name, error: err.message };
    }
  }

  async debugAdd(data: any) {
    try {
      await this.dlqQueue.waitUntilReady();
      const j = await this.dlqQueue.add('email', data, {
        attempts: 1,
        removeOnComplete: false,
      });
      const counts = await this.dlqQueue.getJobCounts(
        'waiting',
        'failed',
        'completed',
        'active',
        'delayed',
      );
      return { addedId: j.id, counts };
    } catch (err: any) {
      this.logger.error(`Failed to add debug job to DLQ: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
}
