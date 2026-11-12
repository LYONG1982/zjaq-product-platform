import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const isWindows = process.platform === "win32";
const apiPort = 3100,
  portalPort = 3200,
  adminPort = 3201,
  h5Port = 3202;
const host = process.env.DEMO_LAN_HOST ?? lanAddress();

// 子进程的 process.execPath 与 PATH 中的 node 必须和父进程一致：
// nvm 切换版本后，PATH 里的 node 可能已变成低版本，导致文件解析子进程直接崩溃。
const nodeVersion = process.versions.node.split(".").map(Number);
if (nodeVersion[0] < 22)
  throw new Error(`需要 Node >= 22，当前为 ${process.versions.node}，请先切换 nvm 版本`);
const nodeDir = dirname(process.execPath);
const missingMysql = ["MYSQL_USER", "MYSQL_DATABASE"].filter((key) => !process.env[key]);
if (missingMysql.length) {
  console.error(
    `缺少 MySQL 配置：${missingMysql.join(", ")}。请先设置 MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE，并执行 pnpm db:migrate 与 pnpm db:init。`,
  );
  process.exit(1);
}

// winget 安装的 ffprobe 常因当前终端 PATH 过期而不可见，这里主动定位并显式注入。
function findFfprobe() {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  const winget = join(homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages");
  try {
    for (const name of readdirSync(winget).filter((entry) => entry.startsWith("Gyan.FFmpeg")))
      for (const build of readdirSync(join(winget, name))) {
        const candidate = join(winget, name, build, "bin", "ffprobe.exe");
        if (existsSync(candidate)) return candidate;
      }
  } catch {
    /* 未安装或目录不可读 */
  }
  return undefined;
}
const ffprobe = findFfprobe();

function lanAddress() {
  for (const entries of Object.values(networkInterfaces()))
    for (const entry of entries ?? [])
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254."))
        return entry.address;
  throw new Error("未找到局域网 IPv4 地址，请用 DEMO_LAN_HOST 显式指定");
}

const origins = [portalPort, adminPort, h5Port].flatMap((port) => [
  `http://${host}:${port}`,
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
]);
const hosts = [`${host}:${apiPort}`, `127.0.0.1:${apiPort}`, `localhost:${apiPort}`];
const shared = {
  ...process.env,
  ZJ_DEV_LAN: "true",
  PATH: nodeDir + ";" + (process.env.PATH ?? ""),
};
const children = [];
let stopping = false;

function track(name, child) {
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code) => {
    if (!stopping) console.log(`[${name}] 已退出（code=${code}）`);
  });
  children.push({ name, child });
  return child;
}
function pnpm(name, args, env) {
  return track(name, spawn(isWindows ? "corepack.cmd" : "corepack", ["pnpm", ...args], {
    cwd: process.cwd(),
    env: { ...shared, ...env },
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
  }));
}
function nodeScript(name, args, env) {
  return track(name, spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...shared, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  }));
}
function runToCompletion(name, args, env) {
  return new Promise((resolve) => {
    const child = pnpm(name, args, env);
    child.on("exit", (code) => resolve(code === 0));
  });
}

let exitCode = 0;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const { child } of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (isWindows) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 800);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stopAll(0));

async function waitFor(url, seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return true;
    } catch {
      /* 尚未就绪 */
    }
    await sleep(1000);
  }
  return false;
}
const banner = (message) => console.log(`\n== ${message}`);

banner(`局域网演示地址：${host}（覆盖请设 DEMO_LAN_HOST）`);
console.log(
  ffprobe
    ? "== 视频检查工具：" + ffprobe
    : "== 未找到 ffprobe，视频上传将被拒绝；可设置 FFPROBE_PATH 指向工具",
);
// PDF.js 的 worker/字体/wasm 需在门户与 H5 的 public/pdf 下自托管，否则预览报 MIME 错误。
if (!(await runToCompletion("assets", ["preview:assets"], {}))) {
  console.error("PDF 预览资源准备失败，门户与 H5 的 PDF 预览将不可用。");
}

nodeScript("api", ["--import", "tsx", "services/api/src/main.ts"], {
  NODE_ENV: "development",
  DATA_PROVIDER: "mysql",
  API_PORT: String(apiPort),
  API_BIND_HOST: "0.0.0.0",
  ...(ffprobe ? { FFPROBE_PATH: ffprobe } : {}),
  ALLOWED_ORIGINS: origins.join(","),
  ALLOWED_HOSTS: hosts.join(","),
});
if (!(await waitFor(`http://127.0.0.1:${apiPort}/health`))) {
  console.error("MySQL API 未能在 120 秒内就绪，已停止。请检查 MYSQL_* 配置、pnpm db:migrate 与 pnpm db:init 是否完成。");
  stopAll(1);
  process.exit(1);
}
banner("API 就绪");

pnpm("portal", ["--filter", "@zj/portal", "exec", "next", "dev", "--hostname", "0.0.0.0", "--port", String(portalPort)], {
  PORTAL_API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
  PORTAL_PUBLIC_ORIGIN: `http://${host}:${portalPort}`,
  PORTAL_DEV_ALLOWED_ORIGINS: [host, "127.0.0.1", "localhost"].join(","),
});
pnpm("admin", ["--filter", "@zj/admin", "exec", "vite", "--host", "0.0.0.0", "--port", String(adminPort), "--strictPort"], {
  VITE_API_BASE_URL: `http://${host}:${apiPort}/api/v1`,
});
pnpm("h5", ["--filter", "@zj/mobile", "exec", "uni", "-p", "h5", "--host", "0.0.0.0", "--port", String(h5Port)], {
  VITE_API_BASE_URL: `http://${host}:${apiPort}/api/v1`,
});

banner("四个服务启动中（首次编译需等待）");
const ready = await Promise.all([
  waitFor(`http://127.0.0.1:${portalPort}/`),
  waitFor(`http://127.0.0.1:${adminPort}/`),
  waitFor(`http://127.0.0.1:${h5Port}/`),
]);
console.log(`
销售门户   http://${host}:${portalPort}/
管理后台   http://${host}:${adminPort}/   （使用 pnpm db:init 创建的管理员账号）
H5 宣传端  http://${host}:${h5Port}/
API 健康   http://${host}:${apiPort}/health
${ready.every(Boolean) ? "\n四入口已就绪。Ctrl+C 停止全部服务。" : "\n有入口未在 120 秒内就绪，请查看上方日志。"}
其他设备无法访问时，请在 Windows 防火墙放行 TCP ${apiPort},${portalPort},${adminPort},${h5Port}。
数据持久化于 MySQL，上传文件位于 work/storage；请仅在可信内网使用演示账号。`);
if (!ready.every(Boolean)) stopAll(1);
