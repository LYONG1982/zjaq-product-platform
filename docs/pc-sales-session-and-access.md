# PC 销售访问及大文件传输

已确认的端划分是：PC 为销售内部工作台，H5/微信为对外宣传端。PC 的 `/`、`/products`、`/materials`、产品详情及 `/viewer` 均在服务端校验销售会话；匿名访问跳转 `/sales`，保留合法的本站目标页。旧 `/api/catalog` 兼容路径也要求销售会话，并转发至销售资料接口，不能继续匿名读取。管理身份不自动获得销售角色。

## 身份与生产配置

- 浏览器通过已配置的 CloudBase 身份服务取得凭证，交给本站 `/api/sales/session`。该接口先调用真实 `/sales/me` 核验销售角色，再建立会话；登录失败不回退 Mock。
- 会话存放在 AES-256-GCM 加密的 `HttpOnly; SameSite=Strict; Path=/` cookie 中，有效期 30 分钟，凭证不进入 URL、localStorage 或页面返回字段。每个 API 请求和服务端页面读均重新检查上游身份；上游会话期限/账号禁用仍优先。
- 生产必须设置 `PORTAL_SESSION_SECRET`，为独立的 64 位十六进制值（32 个随机字节）。生产缺失或非法时拒绝建立会话。所有 PC 实例使用相同秘密；轮换会使已有会话失效。不要提交真实值。
- 生产使用 `__Host-zj-sales` cookie 并增加 `Secure`，必须通过 HTTPS 访问；不设置 Domain。反向代理部署应设置 `PORTAL_PUBLIC_ORIGIN=https://实际域名`（无末尾斜杠），并正确转发原始主机/协议，不应放宽 CSRF origin 校验。开发环境从实际 Host 校验来源，兼容 Next 内部规范化 localhost；不信任任意 X-Forwarded-Host。
- `NEXT_PUBLIC_CLOUDBASE_ENV_ID` 和 `NEXT_PUBLIC_CLOUDBASE_AUTH_ORIGIN` 必须明确配置，后者只接受 `https://<env-id>.api.tcloudbasegateway.com`。实际 CloudBase 登录与账号绑定仍须在真实环境验证。
- `PORTAL_API_BASE_URL` 指向共享 API。生产应通过私有网络或 HTTPS 连接，避免 Bearer 凭证经过不可信网络。
- 本地测试仅在 `NODE_ENV !== production` 且明确开启 `NEXT_PUBLIC_ENABLE_SALES_MOCK=true` 时显示本地验证按钮。开发进程未设置会话秘密时临时生成内存密钥，重启即失效。该能力在 production 中始终禁用。

## 文件与来源记录

PDF 使用 PDF.js URL/Range 请求；视频使用同源 `<video>` URL；下载使用同源链接，由浏览器下载器直接接收流。Next 代理透传流和 Range/Content-Range 等头，不以 Blob/arrayBuffer 聚合 500 MiB 文件，不将 Bearer 放入下载地址。代理响应 `private, no-store`、`nosniff`、`Cross-Origin-Resource-Policy: same-origin`，跨站浏览器请求被拒绝。会话建立/退出额外验证精确 Origin。

销售只可读取当前发布资料。服务端对每次清单、Range、预览和下载重新核验版本及资源用途，撤回/更新后新的资源请求被拒绝。已下载或已缓冲的字节无法通过撤回收回。退出清理 cookie 和浏览器缓存，并在返回/焦点恢复时重新检查会话。

下载处显示统计告知：管理员开启统计后记录资料、时间和服务观测到的来源 IP，保留 90 天，仅授权管理员查看。Next 不转发浏览器任意提供的 X-Forwarded-For；API 默认观察到的是代理 IP。部署若需真实 IP，必须按 API 的可信代理配置通过受控网关建立可核实的代理链，不能将任意外部头当真实来源。

## 本地证据与限制

会话单元测试覆盖加密、防篡改、到期、生产配置拒绝、跨站登录/退出拒绝及真实身份失败不回退 Mock。销售目录测试覆盖技术/未分类资料、别名检索、分页和身份拒绝。Playwright 覆盖匿名 PC 页面与旧 API 收口、HttpOnly 会话、筛选、预览、Range 下载及退出后拒绝。

以上不等于真实身份、真实云网关吞吐或微信设备验收；必须使用最终部署身份服务、网关、存储及目标设备作独立验证。
