# MP4/H.264 上传与具体错误原因：补齐报告

日期：2026-11-05。状态：已在隔离源码与本地验证环境完成；未部署或推送。用户说明“尚未复现，先按需求补齐”，因此本报告记录需求补齐与受控故障验证，不将其描述为线上故障根因结论。

## 解决方案与已修复缺口

正常链路继续采用“上传文件 → 服务端验证真实内容 → READY → 检查预览件 → 填写资料 → 保存/发布”。MP4 是容器，实际视频编码由受信任 ffprobe 校验，不能仅靠扩展名判断。保留 MP4/MOV 的 H.264、AAC/MP3 或无音轨，以及原有 WebM 兼容；单文件 ≤500 MiB，不自动转码，不放宽安全检查。默认版本仍为 V01.0。

补齐前，受控模拟网关返回 413/502/503 且正文非 JSON 时，客户端均抛出 `Cannot read properties of null (reading 'error')`，丢失了真正的 HTTP 原因。这是本机可复现的代码缺口，不是已证明的线上配置故障。

| 情况 | 当前反馈与处理 |
| --- | --- |
| 格式不支持 / 扩展名伪装 | 选择阶段说明支持 MP4/MOV/WebM；字节签名与真实容器不符时返回 VIDEO_CONTAINER_MISMATCH，提示重新导出，不能靠改名转换 |
| 视频编码不支持 | VIDEO_CODEC_UNSUPPORTED，显示检测到的编码（如 HEVC/MPEG4），提示导出 H.264；先判断编码，避免 HEVC 10bit 被错误归因到尺寸/像素限制 |
| 音频编码不支持 | VIDEO_AUDIO_CODEC_UNSUPPORTED，单独说明音频编码与 AAC/MP3（WebM 为 Opus/Vorbis）或无音轨方案 |
| 超出大小 | 前端与服务端继续限制 500 MiB；网关 HTML/空响应的 HTTP 413 被保留为 FILE_TOO_LARGE。提示文件未超应用上限时需检查网关限额，不谎称所有 413 都是文件超过 500 MiB |
| 检查工具缺失 / 配置问题 | VIDEO_PROBE_UNAVAILABLE / VIDEO_PROBE_CONFIGURATION；缺失、权限、工具选项/运行依赖问题与“文件损坏”区分，提示管理员检查服务 |
| 检查结果异常 / 解析进程异常 | VIDEO_PROBE_INVALID_RESULT / FILE_CHECK_UNAVAILABLE；无效 JSON、空/畸形元数据、输出超限等均有安全说明，不显示 HTML、内部路径或堆栈 |
| 文件损坏、参数或轨道不支持 | VIDEO_CORRUPT / VIDEO_LIMIT_UNSUPPORTED / VIDEO_TRACKS_UNSUPPORTED；给出重新导出或参数要求，保留原有 4 小时、4K、4:2:0 与轨道限制 |
| 网关或服务异常 | HTTP 502/503 等映射为 SERVER_UNAVAILABLE，保留 HTTP 状态和可读取的请求编号；504/408 单独提示超时，507 提示存储空间不足 |
| 网络中断 / 上传响应丢失 | 保留首次上传错误；状态回查失败不覆盖原始原因。已接收的字节按既有状态继续检查，验证不会重复 PUT |

错误面板显示具体原因、下一步、发生阶段及可用的请求编号，支持复制问题详情；未知或不可读取的请求编号不编造。保留重试、重选、失败时禁用完成、上传百分比、暂存替换与历史资料。标准 JSON 业务错误及 fieldErrors 原样保留，没有修改 HTTP 接口或存储字段。

## 修改范围

- `packages/api-client/src/index.ts`：安全解析非 JSON/空响应，按 HTTP 状态兜底；XHR、fetch、上传完成和媒体会话共享错误处理。
- `apps/admin/src/upload.ts`、新增 `upload-errors.ts`：保留首次错误和实际请求编号，按上传阶段生成可操作说明，保持幂等任务/恢复机制。
- `apps/admin/src/components/MaterialDrawer.vue`：上传前明确推荐编码，上传失败显示文字说明、下一步和复制入口。
- `services/mock-api/src/parse-file.mjs`、`assets.ts`：补齐工具配置/结果异常、容器、视频/音频编码等具体分类，安全收口未知检查异常。真实 CloudAssets 复用同一校验器，未连接真实云。
- 新增 `tests/unit/video-errors.test.ts`、`tests/browser/video-errors.spec.ts`。没有修改业务契约、领域字段、原产品/资料或角色规则。

## 验证结果

证据目录：`work/video-followup-20261105/`。

| 验证 | 结果与证据 |
| --- | --- |
| 视频/大文件与错误处理单元验证 | 10 项通过，其中 7 项既有视频/媒体/大文件测试、3 项新增错误矩阵。最后补充畸形 format/工具输出超限后，新增 3 项再次通过：`unit-video.log`、`unit-errors-final.log` |
| 真实工具超时分类 | 1 项通过，实际等待并终止 60 秒未响应的工具；缺失、损坏、编码及无路径泄露同时验证：`unit-probe-timeout.log` |
| API/契约/管理兼容 | 13 项通过：`unit-contracts.log`；合计 24 个独立单元/契约用例通过，不重复计算定向复测 |
| 后台错误浏览器验证 | 7 项通过：真实伪装 MP4、真实 MPEG4 编码 MP4 拒绝、格式前置拦截、HTML 413/502/503 与失败回查、丢失上传响应后恢复：`browser-errors-final.json`、`browser-errors-final.log` |
| 上传与实际播放 | 2 项既有浏览器回归通过：真实 MP4/H.264 上传并在后台、H5、销售 PC 播放，currentTime 实际增长；另验证 500 MiB 文件上传与 501 MiB 前置拒绝：`browser-playback.json`、`browser-playback.log` |
| 大文件视频真实性 | 单元测试对实际 500 MiB MP4 执行流式写入、ffprobe、校验和；499/500 MiB 真实 HTTP 流、206 Range 与 Cloud 磁盘替身验证通过。不是公网/真实云性能结论 |
| 类型与构建 | 根、后台、移动、PC 类型检查通过；后台、H5、小程序隔离构建通过；生成物一致性与 `git diff --check` 通过。销售 PC 使用独立 Next 开发服务完成播放，不宣称本轮另做生产部署 |

合计 9 个独立浏览器用例通过。首次“丢失 PUT 响应”夹具的自动化转发未原样保留二进制，修正为明确传递真实样片 Buffer 后通过；未因此改动应用字节上传行为。

截图：`VIDEO_CODEC_UNSUPPORTED-message.png`、`VIDEO_CONTAINER_MISMATCH-message.png`、`gateway-413-message.png`、`gateway-502-message.png`、`gateway-503-message.png`；已目视核对具体原因、下一步、请求编号和复制按钮可见。

## 现有 UAT 与数据保护

- 原 UAT 602 个受控/原未跟踪文件前后 SHA-256 一致，未写入、重启、seed/reset。
- 既有隔离 3403 会话保持 `e83342ef-6252-41ee-ae9c-2bd201569ea3`；正常产品 81、移除 0、系列 4，前后不变。产品/81 份草稿/系列/分享/站点 Banner 与联系配置的归一化摘要仍为 `d6bd12b15ca46393c393e79bfff7a31579c03dde8acb00119b441baa1bfd9f2d`。
- 新增测试记录仅写入本次独立临时 Mock 3413。原 3300–3303 与既有 3400–3403 服务未重启或重置；原 3401 静态构建保留，补齐版本另行预览。
- Next 临时开发服务自动生成的 next-env 引用已按修改前哈希还原，新增自动生成 AGENTS.md 在停止本次 3410 临时 PC 服务后清理；未删除原 UAT 的既有 AGENTS.md。
- 相对本轮开始，代码路径仅上述 6 个应用/公共模块与 2 个新增测试。保护证据：`before.json`、`after.json`、`preservation-result.json`；修改前源文件保存在 `before-source/`。

## 本次补齐版本预览

- 后台：<http://127.0.0.1:3411>，搜索 `【验证数据】视频闭环-a230d8` 可查看已验证的虚构蓝色视频资料。
- H5：<http://127.0.0.1:3412>；API：<http://127.0.0.1:3413/health>。仅本地虚构验证数据，不代表正式发布。
- 本次 3410 销售 PC 临时服务已停止；其播放验收证据保留。原 3400 销售 PC 未改配置、未重启。

## 实际命令摘要

日志均保存于本报告证据目录。依赖没有升级。

```sh
# 项目根目录
python3 work/video-followup-20261105/snapshot.py before
node --import tsx --test tests/unit/video-errors.test.ts tests/unit/upload-video.test.ts
node --import tsx --test tests/unit/api.test.ts tests/unit/contracts.test.ts tests/unit/management.test.ts
node --import tsx --test --test-name-pattern='video failures distinguish' tests/unit/second-test-iteration.test.ts
node --import tsx --test tests/unit/video-errors.test.ts
node node_modules/typescript/bin/tsc -p tsconfig.json
node --import tsx scripts/generate.ts --check
node --import tsx work/video-followup-20261105/api.ts
node scripts/preview-static.mjs work/video-followup-20261105/admin 3411
node scripts/preview-static.mjs work/video-followup-20261105/h5 3412
# apps/admin 下
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
VITE_API_BASE_URL=http://127.0.0.1:3413/api/v1 VITE_MOCK_TOKEN=local-admin node node_modules/vite/bin/vite.js build --outDir ../../work/video-followup-20261105/admin
# apps/mobile 下
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
VITE_API_BASE_URL=http://127.0.0.1:3413/api/v1 node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p h5 --outDir ../../work/video-followup-20261105/h5
VITE_API_BASE_URL=http://127.0.0.1:3413/api/v1 node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin --outDir ../../work/video-followup-20261105/mini
# apps/portal 下
NEXT_DIST_DIR=.next-video-followup-dev PORTAL_API_BASE_URL=http://127.0.0.1:3413/api/v1 NEXT_PUBLIC_ENABLE_SALES_MOCK=true node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3410 --webpack
node node_modules/typescript/bin/tsc --noEmit
```

浏览器使用根目录 `node node_modules/@playwright/test/cli.js test`，分别运行 `tests/browser/video-errors.spec.ts` 与 `tests/browser/upload-video.spec.ts`；环境变量为 `TEST_API_URL=http://127.0.0.1:3413`、`TEST_ADMIN_URL=http://127.0.0.1:3411`、`TEST_H5_URL=http://127.0.0.1:3412`、`TEST_PORTAL_URL=http://127.0.0.1:3410`、`CHROMIUM_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，使用 `--reporter=list,json`，报告与截图写入上述证据目录。最后执行 `snapshot.py after` 和 `git diff --check`。

## 仍需独立验收

真实服务须具备可用 ffprobe、足够网关大小/处理时长、可写临时存储、正确媒体会话与同站访问配置；微信 iOS/Android 实际播放、真实云大文件/Range 仍待验证。未拿到实际失败文件或线上日志，不宣称已修复某次线上故障；本轮未推送、部署、改域名或改变真实数据。
