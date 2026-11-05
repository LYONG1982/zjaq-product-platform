import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";

const messages = {
  VIDEO_PROBE_UNAVAILABLE: "服务端视频检查工具不可用，请管理员检查安装路径和执行权限",
  VIDEO_PROBE_CONFIGURATION: "服务端视频检查工具配置异常，请管理员检查工具版本和运行依赖",
  VIDEO_PROBE_TIMEOUT: "视频检查超时，请重试；持续失败请管理员检查处理服务",
  VIDEO_PROBE_INVALID_RESULT: "服务端视频检查结果无效，请联系管理员检查工具配置",
};
const failure = (code, reason) => ({ code, reason, message: messages[code] });

// One executable, never a shell command. Used by both preflight and file parsing.
export function videoProbeCommand(env = process.env) {
  const command = env.FFPROBE_PATH || "ffprobe";
  const source = command === "ffprobe" ? "PATH" : "FFPROBE_PATH";
  if (/[\u0000-\u001f]/.test(command) || (command !== "ffprobe" && !isAbsolute(command))) {
    return { command, source, error: failure("VIDEO_PROBE_UNAVAILABLE", "INVALID_PATH") };
  }
  return { command, source };
}

// Never return raw stderr, OS messages, paths or stack traces to API consumers.
// Unknown file-parser exits remain content errors; preflight handles them separately.
export function classifyVideoProbeFailure(error, stderr = "") {
  if (error?.code === "ENOENT") return failure("VIDEO_PROBE_UNAVAILABLE", "NOT_FOUND");
  if (["EACCES", "EPERM"].includes(error?.code)) return failure("VIDEO_PROBE_UNAVAILABLE", "PERMISSION_DENIED");
  if (error?.code === "ENOEXEC" || /Exec format error|bad CPU type|not a valid Win32 application/i.test(stderr)) return failure("VIDEO_PROBE_UNAVAILABLE", "EXEC_FORMAT");
  if (error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return failure("VIDEO_PROBE_INVALID_RESULT", "OUTPUT_LIMIT");
  if (error?.killed || error?.code === "ETIMEDOUT") return failure("VIDEO_PROBE_TIMEOUT", "TIMEOUT");
  if (/error while loading shared libraries|dyld:|Library not loaded|cannot open shared object|\.dll.*(?:missing|not found)/i.test(stderr)) return failure("VIDEO_PROBE_CONFIGURATION", "RUNTIME_DEPENDENCY");
  if (/Unrecognized option|Option .* not found|Error setting option/i.test(stderr)) return failure("VIDEO_PROBE_CONFIGURATION", "UNSUPPORTED_OPTIONS");
  return null;
}

function runVersion(command, env, timeoutMs) {
  return new Promise(resolve => {
    execFile(command, ["-version"], { env, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 64 * 1024, windowsHide: true },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }));
  });
}

export function createVideoProbeRuntime({ env = () => process.env, now = Date.now, run = runVersion,
  timeoutMs = 5000, successTtlMs = 30000, failureTtlMs = 5000 } = {}) {
  let cached, pending, generation = 0;
  const configuration = () => {
    const values = { ...env() };
    // A process restart is required for external service-manager environment changes.
    return { values, key: JSON.stringify([values.FFPROBE_PATH, values.PATH, values.Path, values.PATHEXT]) };
  };
  function status() {
    const { key } = configuration();
    if (pending?.key === key) return { status: "checking", checkedAt: null, expiresAt: null };
    if (!cached || cached.key !== key) return { status: "not_checked", checkedAt: null, expiresAt: null };
    const { result, expires } = cached;
    return { status: now() >= expires ? "stale" : result.ready ? "ready" : "unavailable",
      checkedAt: result.checkedAt, expiresAt: new Date(expires).toISOString(),
      ...(result.ready ? { version: result.version } : { code: result.code, reason: result.reason }) };
  }
  async function check({ force = false } = {}) {
    const { values, key } = configuration();
    if (pending?.key === key) return pending.promise;
    if (!force && cached?.key === key && now() < cached.expires) return cached.result;
    const current = ++generation;
    const promise = (async () => {
      const target = videoProbeCommand(values);
      let problem = target.error, version;
      if (!problem) {
        try {
          const { error, stdout, stderr } = await run(target.command, values, timeoutMs);
          if (error) problem = classifyVideoProbeFailure(error, stderr) ?? failure("VIDEO_PROBE_CONFIGURATION", "EXIT_FAILED");
          else {
            // Capture only a short version token, never arbitrary tool output.
            version = /^ffprobe version ([A-Za-z0-9.+_~:\-]{1,80})(?:\s|$)/.exec(stdout)?.[1];
            if (!version) problem = failure("VIDEO_PROBE_INVALID_RESULT", "INVALID_OUTPUT");
          }
        } catch (error) {
          problem = classifyVideoProbeFailure(error) ?? failure("VIDEO_PROBE_CONFIGURATION", "EXIT_FAILED");
        }
      }
      const checked = now();
      const result = { command: target.command, source: target.source, checkedAt: new Date(checked).toISOString(),
        ...(problem ? { ready: false, ...problem } : { ready: true, version }) };
      if (generation === current) cached = { key, result, expires: checked + (result.ready ? successTtlMs : failureTtlMs) };
      return result;
    })();
    pending = { key, promise };
    try { return await promise; }
    finally { if (pending?.promise === promise) pending = undefined; }
  }
  return { check, status };
}

export const videoProbeRuntime = createVideoProbeRuntime();
export async function checkVideoRuntimeAtStartup(runtime = videoProbeRuntime, log = console.log) {
  await runtime.check();
  log(JSON.stringify({ event: "video_runtime_checked", video: runtime.status() }));
}
