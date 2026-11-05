export type ProbeCode = "VIDEO_PROBE_UNAVAILABLE" | "VIDEO_PROBE_CONFIGURATION" | "VIDEO_PROBE_TIMEOUT" | "VIDEO_PROBE_INVALID_RESULT";
export type ProbeFailure = { code: ProbeCode; reason: string; message: string };
export type ProbeResult = { command: string; source: "PATH" | "FFPROBE_PATH"; checkedAt: string } &
  ({ ready: true; version: string } | ({ ready: false } & ProbeFailure));
export type ProbeStatus = { status: "not_checked" | "checking" | "ready" | "unavailable" | "stale";
  checkedAt: string | null; expiresAt: string | null; version?: string; code?: ProbeCode; reason?: string };
export type VideoProbeRuntime = { check(options?: { force?: boolean }): Promise<ProbeResult>; status(): ProbeStatus };
export function videoProbeCommand(env?: NodeJS.ProcessEnv): { command: string; source: "PATH" | "FFPROBE_PATH"; error?: ProbeFailure };
export function classifyVideoProbeFailure(error: unknown, stderr?: string): ProbeFailure | null;
export function createVideoProbeRuntime(options?: {
  env?: () => NodeJS.ProcessEnv; now?: () => number; timeoutMs?: number; successTtlMs?: number; failureTtlMs?: number;
  run?: (command: string, env: NodeJS.ProcessEnv, timeoutMs: number) => Promise<{ error?: unknown; stdout: string; stderr?: string }>;
}): VideoProbeRuntime;
export const videoProbeRuntime: VideoProbeRuntime;
export function checkVideoRuntimeAtStartup(runtime?: VideoProbeRuntime, log?: (line: string) => void): Promise<void>;
