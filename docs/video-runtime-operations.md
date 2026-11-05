# 视频上传工具诊断与远端修复

适用错误：`VIDEO_PROBE_UNAVAILABLE`。Windows 浏览器是上传客户端；要修复的是承载 API 的服务器/容器。截图中的 69 MiB 低于应用 500 MiB 上限，当前错误不能说明原视频编码是否合格。

## 工程师先执行这一条

在部署了本次补丁的项目根目录，以 **API 的实际运行账号、同一环境变量和同一容器/镜像** 执行：

```sh
pnpm check:video-runtime
```

若运行镜像只有 Node 而没有 pnpm，等价命令：

```sh
node scripts/check-video-runtime.mjs
```

发布包须同时包含该脚本及 `services/domain/src/video-probe.mjs`。无需数据库连接；命令不会修改配置、下载工具或重启进程。输出 JSON 包括系统、CPU 架构、命令路径/来源、版本、检查时间和下一步；退出码 0 表示启动检查通过，1 表示失败。不会打印完整环境变量、原始 stderr 或凭据；分享报告前可遮蔽内部目录。

`source: PATH` 表示按服务进程 PATH 查找 `ffprobe`，`command: ffprobe` 是查找名，不声称已解析其完整路径。`source: FFPROBE_PATH` 表示使用指定绝对路径。允许路径包含空格，但变量值本身不能包含额外引号或命令参数。根目录 `.env` 不会被 API 自动加载，编辑 `.env.example` 不会生效；必须通过实际部署启动器注入。

## 按诊断结果修复

| reason | 检查与处理 |
| --- | --- |
| INVALID_PATH | 将 FFPROBE_PATH 改为服务器上的单个可执行文件绝对路径；不要填浏览器电脑路径、相对路径或整条命令。 |
| NOT_FOUND | 在实际账号/容器中确认文件、PATH，以及二进制加载器/解释器存在；安装受信任、适配目标系统的 ffprobe。 |
| PERMISSION_DENIED | 核实程序、父目录的访问和执行权限，以及挂载执行限制；仅赋予服务账号所需权限。 |
| EXEC_FORMAT | 核实系统和 CPU 架构，换用匹配构建；不复制 Mac 程序到 Linux/Windows。 |
| RUNTIME_DEPENDENCY | 修复运行库/动态加载器，或使用经组织批准且兼容的构建。 |
| UNSUPPORTED_OPTIONS | 核实路径和版本；完整解析还需要该版本支持现有安全参数。 |
| TIMEOUT | 检查资源、进程限制和工具异常；版本检查限时 5 秒。 |
| OUTPUT_LIMIT / INVALID_OUTPUT | 确认路径确实是 ffprobe，检查不合适的包装器；版本输出最多 64 KiB。 |
| EXIT_FAILED | 在同一环境执行工具的 `-version`，由工程师查看受限日志进一步定位，勿向用户页面暴露 stderr。 |

缺失时从操作系统受信任的软件源或组织批准的 FFmpeg 构建获得工具。具体安装方式取决于服务器系统、架构、镜像和组织规范，不能在未知服务器上套用安装命令。

### Linux 服务

在 API 的服务账号下确认实际文件，然后把绝对路径注入现有 systemd、进程管理器或启动脚本配置。例如在受控测试 shell（将示例路径替换为已验证路径）运行：

```sh
FFPROBE_PATH=/usr/bin/ffprobe node scripts/check-video-runtime.mjs
```

此命令只影响该次诊断，不会修改正在运行的 API。生产环境要在实际服务启动器中设置同一变量；按原部署流程核实变更及重载。

### Windows Server

只适用于 API 确实部署于 Windows Server 的情况。安装匹配架构的受信任 `ffprobe.exe`，由 API 服务账号验证目录和执行权限。在 PowerShell 的示例：

```powershell
$env:FFPROBE_PATH = 'C:\Tools\ffmpeg\bin\ffprobe.exe'
node scripts/check-video-runtime.mjs
```

PowerShell 的引号是赋值语法，不属于变量值。该赋值只作用于当前进程及其子进程；另行配置实际 Windows 服务/进程管理器的环境，不能据交互登录账号成功推断服务账号可运行。不要用 `.bat`、`.cmd` 代替可执行文件。

### 容器与受限云运行时

检查 **运行阶段的镜像**，宿主机或构建阶段有工具不代表运行镜像有工具。将兼容的 ffprobe 和所需运行库纳入现有镜像构建流程，配置容器内绝对路径，并以实际非 root 服务用户执行自检。多副本逐个核实版本/环境，按现有发布流程滚动更新。

云函数等受限平台需确认允许创建子进程、可执行目录/架构、依赖打包以及时长和资源限制。无法满足时，应在已有架构约束下另行设计媒体检查服务，不能关闭检查或回退 Mock。

## API 行为与验收边界

- 启动时做一次有限检查，输出脱敏 `video_runtime_checked` 日志；工具缺失不停止 PDF、图片和读取接口。
- 视频上传意图先完成身份、请求和产品权限校验，再检查工具；失败返回 HTTP 503、既有 VIDEO_PROBE_* 代码和 requestId，不创建上传记录，不接收视频文件字节。
- 同一进程并发预检合并；成功缓存 30 秒，失败缓存 5 秒。到期后的下一次视频意图重新检查，修复后无需为了清缓存重启。若改了服务启动器环境，仍须按部署流程使 API 进程获得新环境。
- `/health` 保留 `status: ok` 等字段，新增 `capabilities.video`。它只读缓存，绝不因公开查询运行子进程：`not_checked` 未检查，`checking` 检查中，`ready` 检查有效，`unavailable` 有效期内失败，`stale` 结果过期。`checkedAt`/`expiresAt` 为 UTC 时间。无视频请求的服务过 30 秒显示 stale 是预期行为，不代表后台定时故障；此时由工程师自检或下一次合法上传重新检查。
- `ready` 只证明工具能启动并返回版本，不证明所有参数、视频编码、存储或浏览器播放可用。完整上传仍检查容器、轨道、编码、像素、时长；预检之后工具故障也会在 complete 阶段拒绝并清理文件。不得跳过完整检查或自动接受视频。

完成环境修复后，按以下顺序验收：

1. 记录运行源码版本、部署方式、账号/容器和脱敏自检结果。核实真实存储提供方及备份；若使用内存 Mock，直接重启可能丢数据，不得作为生产修复方案。
2. 按原部署流程使配置生效；复核所有实例的启动日志及自检。
3. 在原网站用 Windows 浏览器重传原 69 MiB 视频，记录 requestId，确认 READY、预览和播放时间增长，检查 Range 响应。
4. 如工具恢复后出现编码/内容错误，依据新错误处理原文件。只有这一轮通过，才可宣布远端上传故障修复。

本次源码补丁未访问或修改远端服务器；本地 Mock 验证不等于 Windows、Linux、云服务或原视频验收。回退仅撤销视频补丁/按原流程恢复工具配置，不删除业务数据、上传目录或二维码成果。

依据：[FFprobe 官方参数文档](https://ffmpeg.org/ffprobe.html)、[Node.js 子进程文档](https://nodejs.org/api/child_process.html)。程序使用 execFile 直接启动文件，不启用 shell；版本预检与实际媒体内容解析为两个步骤。
