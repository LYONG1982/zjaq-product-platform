# 视频工具故障：代码补丁与验证记录

日期：2026-11-05。用户确认：“确认视频修复计划，开始实施”。方案 A 完成；方案 B（实际服务器修复和 Windows 原站验收）待完成，计划继续保留 active。

## 实施结果

新增共用 `services/domain/src/video-probe.mjs`：统一 FFPROBE_PATH/PATH 规则、execFile 版本预检、5 秒超时/64 KiB 输出限制、错误分类和脱敏状态。成功缓存 30 秒、失败缓存 5 秒，并合并并发检查。启动入口记录脱敏结果；缺失工具不阻断整个 API 启动。

共享 HTTP 上传入口在身份、请求和产品权限检查后、创建记录和收取视频字节前执行预检。失败返回 HTTP 503、VIDEO_PROBE_* 和 requestId；PDF/图片继续使用原流程。原解析器复用路径和错误分类，仍进行全部视频内容校验。健康接口只读缓存，不通过公开请求启动子进程；过期状态明确显示 stale。

新增 `pnpm check:video-runtime`，无需数据库或服务重启。工程师手册见 [视频运行环境诊断](video-runtime-operations.md)。该命令定位运行依赖故障，不会自动安装服务器工具或宣布视频内容合格。

## 源码位置与保护

本轮实施位置：`work/h5-footer-qr-20261105`，分支 `codex/h5-footer-qr-20261105`；基线 HEAD 和检查时的远端 main 均为 `df15a1c2a98abaf62a77a00807c37aab72dd4b6e`。随后用户授权“发布更新 Github”，视频与此前二维码增量已作为源码提交推送；未部署到远端服务器。详见 [GitHub 交付记录](2026-11-05-qr-video-github-delivery.md)。

10 个既有二维码修改/文档文件的 SHA-256 全部一致；原始干净来源工作区的 653 个跟踪文件全部一致。证据：`work/video-runtime/source-preservation.json`。没有写入旧 UAT API；浏览器使用新建的临时 API 子进程和存储，测试结束清理其自身目录。

## 验证结果

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| 定向单元/API/契约回归 | 27/27 通过 | `work/video-runtime/unit-tests-final.log` |
| 工具失败与恢复 | 路径/权限/格式/依赖/超时/输出异常分类；并发合并、TTL、配置变更和故障恢复；CLI 成功退出 0、失败退出 1 | 同上，`video-runtime.test.ts` |
| 上传前拒绝 | 返回 503 + requestId，无上传记录、无文件、无幂等记录；身份和请求错误先返回；PDF/PNG 均 READY | 同上 |
| 视频与大文件既有链路 | MP4/MOV/WebM、500 MiB MP4、499/500 MiB PDF、501 MiB 拒绝、Range、Cookie 和存储替身回归通过 | 同上 |
| 浏览器场景 | 3/3 通过：缺失工具时 0 次 PUT，恢复后同一弹窗重试 1 次 PUT，READY，Range 206，播放 currentTime=0.346、readyState=4；损坏文件和 MPEG4 编码仍拒绝 | `work/video-runtime/browser.log`、`browser-results.json`、`browser-evidence.json`、`browser-before.png`、`browser-ready.png` |
| 根类型检查 | `tsc -p tsconfig.json` 通过 | `work/video-runtime/typecheck.log` |
| 生成物/语法/补丁格式 | `generate.ts --check`、新 mjs 的 `node --check`、`git diff --check` 通过 | 命令退出码 0 |
| 运维命令 | 本地 darwin/arm64、PATH ffprobe 8.1.1 返回 ready，确认命令可用；仅本地证据 | `work/video-runtime/cli-success.log` |

Windows/Linux 实际服务器、真实 CloudBase、原 69 MiB 文件与用户原网站均未验证。没有后台网址、服务器系统/部署方式或管理连接；不据本地结果推断线上恢复。

## 可复现命令与过程问题

在本实施工作区运行：

```sh
node --import tsx --test tests/unit/video-runtime.test.ts tests/unit/video-errors.test.ts tests/unit/upload-video.test.ts tests/unit/contracts.test.ts tests/unit/api.test.ts
node node_modules/typescript/bin/tsc -p tsconfig.json
node --import tsx scripts/generate.ts --check
pnpm check:video-runtime
```

本工作区复用原依赖链接，pnpm 11 的运行前依赖核对尝试重新安装并因非交互环境中止，未安装或升级依赖；本轮用直接 Node 命令运行检查，用 `pnpm_config_verify_deps_before_run=false pnpm check:video-runtime` 验证脚本映射。正常独立部署仍按项目锁文件安装依赖，生产不以绕过依赖核对作为修复手段。

第一次组合回归中，输出上限用例与超时用例共用 300 ms，遇并行负载时先超时；将仅超时用例保留 300 ms，其他执行使用 5 秒，再运行 27/27 通过。首次浏览器尝试因 Playwright 与 API JSON/tsx 加载方式冲突，未执行场景；改用受控 API 子进程和 IPC 后 3/3 通过。

浏览器此次复用了已构建的后台产物，未修改或重新构建前端：

```sh
node scripts/preview-static.mjs work/contact-qr/admin 3431
TEST_VIDEO_RUNTIME_ISOLATED=true CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' PLAYWRIGHT_JSON_OUTPUT_FILE=work/video-runtime/browser-results.json node node_modules/@playwright/test/cli.js test tests/browser/video-runtime.spec.ts --output=work/video-runtime/browser-artifacts
```

测试将该产物内的 `http://127.0.0.1:3423` 请求转发至自己拥有的随机回环端口；旧 3423 服务不接收测试请求。测试专用 IPC 只存在于 helper 子进程，不新增业务 HTTP 控制接口。其他环境复现时，可单独将后台以 `VITE_API_BASE_URL=http://127.0.0.1:3423/api/v1 VITE_MOCK_TOKEN=local-admin` 构建到临时目录，并用上面静态脚本在 3431 提供此目录；浏览器可使用环境中安装的 Chromium。

## 尚待完成

部署工程师在实际运行账号/镜像中执行自检，安装/修复兼容 ffprobe 并注入真实启动环境，核实存储与数据保全后按原流程发布。随后在 Windows 原网站上传原 69 MiB 文件，确认 READY、预览和播放；通过后才能把远端故障标为已修复。
