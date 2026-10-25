// Durable admission for generator jobs. Spec: web/specs/realtime.md §8.
// One lease serializes all web replicas. Persist BEFORE ARM /start; an unknown outcome
// stays blocked rather than risking a second paid execution. Never touches match archives.
import { createHash } from "node:crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import type { ArchiveSettings } from "./archive-env";
import { nextMatchNumber, type JobStarter } from "./start-match";

export const GLOBAL_STARTS_PER_HOUR = 6;
export const VISITOR_STARTS_PER_HOUR = 3;
/** The generator job stops every execution after 1,800 s (container-apps.bicep, replicaTimeout); past this age, with
 * nothing running, no execution from a reservation can still be playing, so an unconfirmed one may be cleared. */
export const PENDING_RECOVERY_MS = 35 * 60_000;
const HOUR = 3_600_000;
export type ControlState = {
  version: 1;
  lastNumber: number;
  attempts: { visitor: string; at: number }[];
  pending: { number: number; at: number; execution?: string } | null;
};
export const initialControl = (): ControlState => ({ version: 1, lastNumber: 2999, attempts: [], pending: null });
export type LockedControl = { state: ControlState; save(state: ControlState): Promise<void> };
export interface ControlStore {
  exclusive<T>(work: (lock: LockedControl) => Promise<T>): Promise<T>;
  available(): Promise<boolean>;
}
export class ControlBusy extends Error {}
export type StartResult = { status: number; body: { match_id?: string; error?: string } };
const fail = (error: string, status: number): StartResult => ({ status, body: { error } });

export function visitorKey(request: Request): string {
  // A best-effort network key, NOT authenticated identity. The shared global cap
  // still bounds starts if a proxy header is spoofed or the client changes networks.
  const address = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  return createHash("sha256").update(address).digest("hex");
}

export async function admitStart(store: ControlStore, starter: JobStarter, recentIds: () => Promise<string[]>,
  visitor: string, now: () => number = Date.now): Promise<StartResult> {
  try {
    return await store.exclusive(async (lock) => {
      const state = lock.state;
      // The previous ARM response may have been lost. Never assume an unknown submission failed while it could still
      // be running; once it is older than the job's own timeout and nothing runs, it cannot be, so it is cleared.
      if (state.pending) {
        const expired = now() - state.pending.at > PENDING_RECOVERY_MS;
        if (!state.pending.execution) {
          if (!expired || await starter.running()) return fail("start_pending", 409);
        } else {
          const status = await starter.execution(state.pending.execution);
          if (status === "active") return fail("match_running", 409);
          if (status === "unknown" && (!expired || await starter.running())) return fail("match_running", 409);
        }
        state.pending = null;
        await lock.save(state);
      }
      if (await starter.running()) return fail("match_running", 409);
      const t = now();
      state.attempts = state.attempts.filter((a) => a.at > t - HOUR);
      if (state.attempts.length >= GLOBAL_STARTS_PER_HOUR ||
          state.attempts.filter((a) => a.visitor === visitor).length >= VISITOR_STARTS_PER_HOUR) {
        return fail("rate_limited", 429);
      }
      const number = nextMatchNumber(await recentIds(), state.lastNumber + 1);
      if (number === null) return fail("start_unavailable", 503);
      state.lastNumber = number;
      state.attempts.push({ visitor, at: t });
      state.pending = { number, at: t };
      await lock.save(state); // if this fails, /start is never called
      try {
        const execution = await starter.start(number);
        if (!execution) return fail("start_pending", 409);
        state.pending.execution = execution;
        await lock.save(state);
      } catch {
        // Keep the durable reservation even on timeout, lease loss or connection failure.
        return fail("start_pending", 409);
      }
      return { status: 202, body: { match_id: `SYN-${String(number).padStart(4, "0")}` } };
    });
  } catch (error) {
    if (error instanceof ControlBusy) return fail("match_running", 409);
    return fail("start_unavailable", 503); // permissions/storage faults must never bypass admission
  }
}

function validState(value: unknown): ControlState {
  const s = value as ControlState;
  if (!s || s.version !== 1 || !Number.isInteger(s.lastNumber) || s.lastNumber < 2999 || s.lastNumber > 9999 ||
      !Array.isArray(s.attempts) || s.attempts.length > GLOBAL_STARTS_PER_HOUR ||
      !s.attempts.every((a) => typeof a.visitor === "string" && Number.isFinite(a.at)) ||
      (s.pending !== null && (!s.pending || !Number.isInteger(s.pending.number) ||
        s.pending.number !== s.lastNumber || !Number.isFinite(s.pending.at) ||
        (s.pending.execution !== undefined && !/^[a-zA-Z0-9_-]+$/.test(s.pending.execution))))) {
    throw new Error("Invalid start-control state");
  }
  return s;
}

export function createControlStore(settings: ArchiveSettings["blob"]): ControlStore {
  const service = settings.kind === "endpoint"
    ? new BlobServiceClient(settings.endpoint, new DefaultAzureCredential(), { retryOptions: { maxTries: 1 } })
    : BlobServiceClient.fromConnectionString(settings.connectionString, { retryOptions: { maxTries: 1 } });
  const container = service.getContainerClient("match-control");
  const blob = container.getBlockBlobClient("starts.json");
  const signal = () => AbortSignal.timeout(10_000);
  return {
    async available() { return container.exists({ abortSignal: signal() }); },
    async exclusive(work) {
      const initial = JSON.stringify(initialControl());
      try {
        await blob.upload(initial, Buffer.byteLength(initial), { conditions: { ifNoneMatch: "*" }, abortSignal: signal() });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (!["BlobAlreadyExists", "ConditionNotMet", "LeaseIdMissing"].includes(code ?? "")) throw error;
      }
      const lease = blob.getBlobLeaseClient();
      try {
        await lease.acquireLease(60, { abortSignal: signal() });
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 409) throw new ControlBusy();
        throw error;
      }
      try {
        const data = await blob.downloadToBuffer(0, undefined, {
          conditions: { leaseId: lease.leaseId }, abortSignal: signal(),
        });
        return await work({ state: validState(JSON.parse(data.toString("utf8"))), async save(state) {
          const body = JSON.stringify(validState(state));
          await blob.upload(body, Buffer.byteLength(body), {
            conditions: { leaseId: lease.leaseId }, abortSignal: signal(),
          });
        } });
      } finally {
        await lease.releaseLease({ abortSignal: signal() }).catch(() => undefined);
      }
    },
  };
}
