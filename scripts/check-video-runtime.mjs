import { platform, arch } from "node:os";
import { createVideoProbeRuntime } from "../services/domain/src/video-probe.mjs";

const result = await createVideoProbeRuntime().check();
const guidance = {
  INVALID_PATH: "FFPROBE_PATH 必须是服务器上的单个可执行文件绝对路径，不加引号、不附加参数；环境由实际服务启动器注入。",
  NOT_FOUND: "检查 API 运行账号或容器内的 ffprobe 是否存在；确认 FFPROBE_PATH / PATH。文件存在时还需检查解释器或动态加载器。",
  PERMISSION_DENIED: "检查 API 运行账号对程序和父目录的访问/执行权限，以及挂载点执行限制；不要使用 chmod 777。",
  EXEC_FORMAT: "选择与服务器系统和 CPU 架构匹配的 ffprobe；检查二进制及加载器。",
  RUNTIME_DEPENDENCY: "补齐该系统/镜像需要的动态库或采用可信且兼容的构建。",
  UNSUPPORTED_OPTIONS: "检查 ffprobe 版本和实际程序，确认支持现有视频解析参数。",
  TIMEOUT: "检查服务器资源与进程执行限制；工具未在 5 秒内完成版本检查。",
  OUTPUT_LIMIT: "程序输出超过自检上限；确认路径指向可信 ffprobe 可执行文件。",
  INVALID_OUTPUT: "版本输出不是预期的 ffprobe 格式；确认配置未指向其他程序或包装器。",
  EXIT_FAILED: "版本检查退出失败；在相同运行账号和容器内直接执行 ffprobe -version 查看受限运维日志。",
};
console.log(JSON.stringify({ check: "video-runtime", platform: platform(), arch: arch(), ...result,
  nextStep: result.ready
    ? "工具启动检查通过；仍需确认 API 服务使用相同环境，并在原网站上传原视频验证 READY、预览和播放。"
    : guidance[result.reason],
  guide: "docs/video-runtime-operations.md" }, null, 2));
process.exitCode = result.ready ? 0 : 1;
