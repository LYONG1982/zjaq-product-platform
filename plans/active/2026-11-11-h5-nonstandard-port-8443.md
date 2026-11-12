# H5 顶替小程序 + 全站非标端口 8443 过渡部署计划

- 状态：仓库侧已实施（2026-11-11，用户确认后执行）；目标机未操作
- 日期：2026-11-11
- 目标机：192.168.128.5（公网 222.75.78.166 走 NAT）
- 前置已完成：三镜像 `zjaq/{api,portal,web}:2026-11-11` 已构建；compose 已起；OpenResty `1Panel-openresty-o4pb` 为 host 网络；`conf.d/zjaq-product-platform.conf` 的 portal/admin 443 段已生效；wx 443 由既有 `default/wx_product.conf` 服务（不得触碰）。

## 一、现场事实与约束

| 项 | 值 |
|---|---|
| OpenResty conf.d 宿主目录 | `/home/1panel/www/conf.d` |
| 证书 | `/home/1panel/apps/openresty/openresty/conf/ssl/zhongjianquan.{crt,key}`，SAN `*.product.zhongjianquan.com` |
| 容器内证书路径 | `/usr/local/openresty/nginx/conf/ssl/zhongjianquan.{crt,key}` |
| web 容器 | 仅 `127.0.0.1:8080 -> 443`，容器内只 `listen 443` |
| 既有 wx 443 站点 | `default/wx_product.conf` → `http://192.168.128.6:2000/`，含 `/hrxjs1LgTG.txt` alias；**本轮不动** |
| 公网 80/443 | 运营商拦截（未备案），TCP 443 超时 |
| 源码 | `/home/zjaq`，`.env` 在 `/home/zjaq/deploy/.env` |

不可违反：不停用 OpenResty、不改 `default/wx_product.conf`、不改动现有 80/443 段、不碰 1Panel 面板。

## 二、目标口径（计划按此写，可在确认时调整）

- `https://portal.product.zhongjianquan.com:8443/` → PC 门户
- `https://admin.product.zhongjianquan.com:8443/` → 管理后台
- `https://wx.product.zhongjianquan.com:8443/` → H5 宣传页；同源 `/api/v1` 由 web 反代到 api
- OpenResty 新增 `listen 8443 ssl` 三段；现有 80/443 段与旧 wx 443 站点全部保持原样

## 三、流量路径与关键结论（先明确再改文件）

```
浏览器 --https:8443--> OpenResty(host 网络, TLS 终止, 同一张证书)
        --https://127.0.0.1:8080, Host: <去掉端口的域名>, SNI=<域名>--> web 容器
        --按 Host 命中 web 内 443 server 块--> portal / admin 静态 / h5 静态 + /api/v1 --> api:3100
```

由此得到三个重要结论：

1. **web 不需要新监听端口，compose 不需要新增端口映射**。8443 完全由 OpenResty 承担，`127.0.0.1:8080:443` 保持不变。
2. **OpenResty 段必须继续用 `proxy_set_header Host $host;`**。nginx 的 `$host` 不含端口，所以 web 与 api 看到的 Host 仍是 `wx.product.zhongjianquan.com`，`ALLOWED_HOSTS` 无需加 `:8443`。若误用 `$http_host`，Host 会带端口，api 精确匹配会 403。
3. **但 `ALLOWED_ORIGINS` 与 `PORTAL_PUBLIC_ORIGIN` 必须改**。浏览器发出的 `Origin` 带端口，而这两处都是精确匹配（见第六节）。

## 四、需要改的文件与逐项改动点

### 4.1 `deploy/scripts/build-images.sh`（必改）

1. 第 24～26 行「基址」区块新增：
   ```bash
   H5_API_BASE="/api/v1"
   ```
   与现有 `WEB_API_BASE`、`MP_API_BASE` 并列。
2. 第 34～37 行构建区块，在 `build:admin` 之后新增：
   ```bash
   VITE_API_BASE_URL="$H5_API_BASE" pnpm build:h5
   ```
   注意 `build:h5` 脚本本身是 `uni build -p h5 && node ../../scripts/sync-preview-assets.mjs --h5`，会把 PDF.js 资源写进 `apps/mobile/dist/build/h5/pdf`，不需要额外步骤。
3. 第 46～50 行 web 上下文区块，在拷 admin 之后新增：
   ```bash
   cp -r apps/mobile/dist/build/h5 "$WEB_CTX/h5"
   ```
4. 第 53 行完成提示追加 h5 产物说明。

产物位置固定为 `apps/mobile/dist/build/h5`（由 `scripts/sync-preview-assets.mjs` 第 16～18 行确认）；H5 用 hash 路由、base 为 `/`（`apps/mobile/src/manifest.json` 第 15～19 行），因此可以挂在 wx 域名的根路径。

### 4.2 `deploy/docker/Dockerfile.web`（必改）

在 `COPY admin ...` 之后新增一行：

```dockerfile
COPY h5 /usr/share/nginx/html/h5
```

预计镜像体积 +6～10 MB（本地 `apps/mobile/dist` 实测 8.6 MB，其中 h5 子目录为主）。web 镜像仍基于 `nginx:1.27-alpine`，整体仍在 ~35 MB 量级，对磁盘无压力。

### 4.3 `deploy/nginx/default.conf.template`（必改）

1. 头部注释第 5～9 行的「H5 不参与本次部署」需改写为三域 + H5 过渡说明。
2. **wx 的 443 server 块（第 94～126 行）** 是主要改动点：
   - 保留 `location /api/` 反代（小程序仍以 `https://wx.../api/v1` 为基址，前缀不能删）。
   - 新增静态托管：
     ```nginx
     root /usr/share/nginx/html/h5;
     index index.html;
     location /assets/ { expires 30d; add_header Cache-Control "public, immutable" always; try_files $uri =404; }
     location = /index.html { add_header Cache-Control "no-store" always; }
     location / { try_files $uri $uri/ /index.html; }
     ```
   - 删除原来的 `location / { return 404; }`。
   - `client_max_body_size` 保持 32m（H5 只提交文本反馈）。
3. 80 段 `server_name` 不变；portal、admin 段不动。

### 4.4 `deploy/compose.yml`（默认不改）

复用 `WX_DOMAIN` 承载 H5，不新增端口、不新增域名变量。仅当确认要点第 2 条选择「独立 h5 子域名」时才需要加 `H5_DOMAIN` 并改 web 环境变量，本计划默认不做。

### 4.5 `deploy/env/.env.example`（必改）

1. `ALLOWED_ORIGINS` 追加两个带端口的 origin：
   ```dotenv
   ALLOWED_ORIGINS=https://admin.product.zhongjianquan.com,https://admin.product.zhongjianquan.com:8443,https://wx.product.zhongjianquan.com:8443
   ```
2. `PORTAL_PUBLIC_ORIGIN` 改为过渡期值（见 6.2）：
   ```dotenv
   PORTAL_PUBLIC_ORIGIN=https://portal.product.zhongjianquan.com:8443
   ```
3. 注释说明：8443 为备案前过渡入口，备案后需回改为不带端口的 443 值。
4. `ALLOWED_HOSTS`、`TRUSTED_PROXY_ADDRESSES` **不改**（理由见第三节结论 2 与 6.3）。

### 4.6 `deploy/1panel/zjaq-h5-8443.conf`（新建）

单独成文件，便于「删文件即回滚」，也避免改动已生效的 443 配置。完整内容见第五节。

### 4.7 `docs/production-deployment.md`（建议改）

新增一节「备案前 8443 过渡入口」：说明端口口径、NAT 映射、`ALLOWED_ORIGINS`/`PORTAL_PUBLIC_ORIGIN` 带端口的原因、备案后回改清单。

### 4.8 `deploy/scripts/healthcheck.sh`（可选）

追加 8443 三项检查（`curl -k https://127.0.0.1:8443 -H 'Host: <domain>'`），避免只验证 443 造成误判。默认不改，按需加。

### 4.9 `apps/mobile/src/pages/detail/index.vue`（新增 UI 改动，随本次 web 重建一起生效，不单独发版）

用户反馈：H5 产品详情页右上角有「本地演示」字样，需要去掉。定位结论：

| 项 | 结论 |
|---|---|
| 命中位置 | `apps/mobile/src/pages/detail/index.vue` 第 135 行，`v2-detail-header` 内的 `<text class="v2-demo">本地演示</text>` |
| 是否 H5 专有 | **不是**。该页面 H5 与小程序共用，模板里没有条件编译包裹 |
| 最终口径 | 用户 2026-11-11 二次确认：**小程序也不需要这段文字**，两端都不显示，因此直接删除，不加条件编译 |
| 其余同名标记 | `components/CatalogView.vue:268`（产品/资料列表页）、`pages/viewer/index.vue:215`（资料预览页）——**均保留不动**，用户尚未决定 |

改动点：整段删除该 `<text>` 节点，保留外层 `<view class="v2-detail-header">` 与返回按钮。

```html
<!-- 改前 -->
<view class="v2-detail-header"><button role="button" tabindex="0" @click="back" aria-label="返回上一页">← 产品详情</button><text class="v2-demo">本地演示</text></view>
<!-- 改后 -->
<view class="v2-detail-header"><button role="button" tabindex="0" @click="back" aria-label="返回上一页">← 产品详情</button></view>
```

不改动项：`.v2-demo` 样式保留（仍被另外两处使用）；`.v2-detail-header` 为 `justify-content: space-between`（`styles/h5-v2.css` 第 99 行），只剩一个子节点时按钮仍居左，不会错位；不碰业务逻辑与其他文案。

回滚：把 `<text class="v2-demo">本地演示</text>` 插回按钮之后、`</view>` 之前即恢复原样，与本次重建同批处理。

## 五、OpenResty 8443 段完整片段

写入 `/home/1panel/www/conf.d/zjaq-h5-8443.conf`（容器内即 `conf.d/zjaq-h5-8443.conf`）：

```nginx
# zjaq 8443 过渡入口：公网 80/443 未备案被拦截期间使用。
# 证书与 443 段共用同一张 *.product.zhongjianquan.com。
# 上线只做 nginx -t + reload；回滚 = 删除本文件 + reload。
# 注意：Host 必须用 $host（不含端口），否则 api 的 ALLOWED_HOSTS 精确匹配会 403。

server {
    listen 8443 ssl http2;
    server_name portal.product.zhongjianquan.com;

    ssl_certificate     /usr/local/openresty/nginx/conf/ssl/zhongjianquan.crt;
    ssl_certificate_key /usr/local/openresty/nginx/conf/ssl/zhongjianquan.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:ZJAQ_8443_SSL:10m;
    ssl_session_timeout 10m;

    client_max_body_size 32m;

    location / {
        proxy_pass https://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_name $host;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}

server {
    listen 8443 ssl http2;
    server_name admin.product.zhongjianquan.com;

    ssl_certificate     /usr/local/openresty/nginx/conf/ssl/zhongjianquan.crt;
    ssl_certificate_key /usr/local/openresty/nginx/conf/ssl/zhongjianquan.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:ZJAQ_8443_SSL:10m;
    ssl_session_timeout 10m;

    # 与 443 段一致：500 MiB 单文件上限 + 关闭请求缓冲
    client_max_body_size 512m;
    client_body_timeout 120s;

    location / {
        proxy_pass https://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_name $host;
        proxy_ssl_verify off;
        proxy_request_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}

server {
    listen 8443 ssl http2;
    server_name wx.product.zhongjianquan.com;

    ssl_certificate     /usr/local/openresty/nginx/conf/ssl/zhongjianquan.crt;
    ssl_certificate_key /usr/local/openresty/nginx/conf/ssl/zhongjianquan.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:ZJAQ_8443_SSL:10m;
    ssl_session_timeout 10m;

    client_max_body_size 32m;

    # H5 静态页与该域名的 /api/v1 都由 web 容器按 Host 分流，这里整段透传
    location / {
        proxy_pass https://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_name $host;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

`http2` 写法说明：与现有 443 段保持同一形式 `listen 8443 ssl http2;`。这是唯一在旧版 OpenResty 上也生效的写法；若版本 ≥ 1.25.1 只会产生 deprecation 警告，不影响功能。不建议改成 `http2 on;`，那要求 ≥ 1.25.1，版本未核实前会直接 `nginx -t` 失败。

SSL 共享缓存使用新名字 `ZJAQ_8443_SSL`，与 443 段的 `ZJAQ_SSL` 分开，避免同名不同尺寸触发 `nginx -t` 报错。

## 六、API 白名单与门户 origin 的精确影响

### 6.1 `ALLOWED_ORIGINS` 必须加带端口的两个值

`services/domain/src/http.ts` 第 234～243 行是**精确匹配** `req.headers.origin`。浏览器对同源 POST 也会带 `Origin`，而 8443 下 origin 为：

- `https://admin.product.zhongjianquan.com:8443`（后台登录、上传等 POST）
- `https://wx.product.zhongjianquan.com:8443`（H5 反馈表单等 POST）

不改则这些请求直接被 403 `ORIGIN_NOT_ALLOWED`。GET 不受影响，所以「页面能打开」会造成误判，必须实测 POST。

### 6.2 `PORTAL_PUBLIC_ORIGIN` 必须改成带端口

`apps/portal/lib/sales-session.ts` 第 48～49 行：`expected = PORTAL_PUBLIC_ORIGIN`，且要求 `origin === expected` 严格相等。8443 下浏览器 Origin 带 `:8443`，若环境变量仍是不带端口的值，门户的销售身份登录/提交会全部 403。

过渡期取值：`PORTAL_PUBLIC_ORIGIN=https://portal.product.zhongjianquan.com:8443`；备案切回 443 时必须改回不带端口的值并重启 portal。

### 6.3 `ALLOWED_HOSTS` 与 `TRUSTED_PROXY_ADDRESSES` 不需要改

- `ALLOWED_HOSTS`：`http.ts` 第 244～249 行同样精确匹配 `req.headers.host`，但 OpenResty 与 web 两层都用 `$host`（不含端口），api 收到的仍是 `wx.product.zhongjianquan.com`，已存在值即可。
- `TRUSTED_PROXY_ADDRESSES`：8443 与 443 走的是同一跳（OpenResty host 网络 → `127.0.0.1:8080` → 容器网关），跳数与现有已验证通过的 443 完全一致，默认 `172.28.0.10` 不变。若 8443 上线后出现来源 IP 全为同一地址或限流误伤，再按 `.env.example` 注释追加实测地址。

### 6.4 H5 的 API 基址：用相对 `/api/v1`

结论：**用相对路径 `/api/v1`**。

理由：
- 同源，无 CORS、无混合内容风险；端口从 8443 切回 443 时**不需要重新构建 H5**。
- `apps/mobile/src/api.ts` 第 17～20 行 `apiBase` 直接取 `VITE_API_BASE_URL`，`resourceUrl` 会把 `/api/v1` 前缀去掉再拼回，相对路径下得到 `/api/v1/media/...`，在 H5 中按当前 origin 解析，正确。
- 小程序构建仍用绝对地址 `https://wx.../api/v1`，两个构建互不影响（分别在 `build:h5` 与 `build:mp-weixin` 注入）。

已知风险与规避：

| 风险点 | 说明 | 规避 |
|---|---|---|
| `uni.request` 相对 URL | H5 实现基于 XHR，相对路径按 document origin 解析，正常 | 构建后实测 GET 列表与 POST 反馈 |
| `uni.previewImage` 相对 URL | 各版本 uni-app 对相对路径处理不完全一致，个别版本要求绝对地址 | 实测图片全屏预览；失败则临时改用绝对基址重建 |
| `<video>` / 图片 `src` | `resourceUrl()` 返回 `/api/v1/media/...`，浏览器按同源解析 | 实测视频播放与图片加载 |
| PDF.js `/pdf/*` | H5 产物自带 `pdf/` 目录，走同源静态，不受 API 基址影响 | 实测资料预览页 |
| H5 被外域嵌入/分享预览 | 相对路径会指向嵌入方域名，必然失败 | 过渡期不承诺外域嵌入；如需，改为绝对基址重建 |

保底方案：若相对路径在上述任一项实测失败，把 `H5_API_BASE` 改为 `https://wx.product.zhongjianquan.com:8443/api/v1` 重建 web 镜像即可，代价是一次重建，不涉及代码逻辑。

## 七、镜像 tag、重建顺序与中断影响

- 仅 **web 镜像**需要重建（api/portal 代码零改动；api、portal 只是 env 变更后重启容器）。
- 建议 `IMAGE_TAG` 升为 `2026-11-12`（若当天实施可用 `2026-11-11-h5`），避免与已在跑的 `2026-11-11` 混淆；旧 tag 保留用于回滚。
- 重建与生效顺序：
  1. 构建 web 镜像（无影响，不触碰运行中容器）。
  2. 改 `.env`（`ALLOWED_ORIGINS`、`PORTAL_PUBLIC_ORIGIN`、`IMAGE_TAG`）。
  3. `docker compose up -d`：api 因环境变量变更被重建、portal 同步重建、web 换新镜像。**此步有一次短暂中断**（api 重建 + 健康检查 `start_period=60s`，预计十几秒内恢复；portal/admin 经 443 访问会短暂 502）。
  4. 落地 `zjaq-h5-8443.conf` → `nginx -t` → `reload`（对 80/443 与旧 wx 站点无影响）。
- 中断窗口只发生在第 3 步；第 1、2、4 步均不中断。这与「8443 本身不占 80/443」是两件事，需要向用户明确。

## 八、回滚

| 场景 | 操作 | 影响 |
|---|---|---|
| 只想撤 8443 | 删除 `/home/1panel/www/conf.d/zjaq-h5-8443.conf` → `nginx -t` → `openresty -s reload` | 仅 8443 消失，443 现状不变；旧 wx 443 站点始终不受影响 |
| 镜像有问题 | `.env` 里 `IMAGE_TAG` 改回 `2026-11-11` → `docker compose up -d` | 一次短暂中断，回到本轮之前状态 |
| 白名单/origin 改错 | `.env` 恢复原值（`ALLOWED_ORIGINS` 只留 admin 443、`PORTAL_PUBLIC_ORIGIN` 去掉端口）→ `docker compose up -d api portal` | 8443 会 403，但 443 现状恢复 |
| 「本地演示」标记需恢复 | 把 `<text class="v2-demo">本地演示</text>` 插回 `apps/mobile/src/pages/detail/index.vue` 第 135 行按钮之后 → 重建 web 镜像 | 与本次重建同批，不单独发版 |
| 全部回退 | 先删 8443 conf + reload，再恢复 `.env` + 旧 tag `up -d` | 等价于本轮未发生 |

「8443 不通时快速退回现状」= 只做第一行删除 + reload；NAT 映射即使留着也只是没人访问的端口。

## 九、目标机执行顺序（用户确认后执行）

```bash
# 0. 备份现状（不中断）
cd /home/zjaq/deploy && cp .env .env.bak-20261111 && docker compose ps

# 1. 同步仓库改动到 /home/zjaq（按实施后的仓库内容）
#    涉及：build-images.sh、Dockerfile.web、default.conf.template、.env.example
#    约定：本步只覆盖这 4 个文件，不动 .env 与 certs

# 2. 改 .env 三个键（ALLOWED_ORIGINS / PORTAL_PUBLIC_ORIGIN / IMAGE_TAG）
#    改完核对：
grep -nE '^(ALLOWED_ORIGINS|PORTAL_PUBLIC_ORIGIN|IMAGE_TAG)=' .env

# 3. 重建 web 镜像（无影响）
cd /home/zjaq && bash deploy/scripts/build-images.sh
docker images | grep 'zjaq/web'

# 4. 编排重启（唯一的中断窗口）
cd /home/zjaq && bash deploy/scripts/deploy.sh

# 5. 本机自测 8443（此时 NAT 未通，只能用 127.0.0.1）
curl -k -s -o /dev/null -w 'portal %{http_code}\n' https://127.0.0.1:8443/ -H 'Host: portal.product.zhongjianquan.com'
curl -k -s -o /dev/null -w 'admin  %{http_code}\n' https://127.0.0.1:8443/ -H 'Host: admin.product.zhongjianquan.com'
curl -k -s -o /dev/null -w 'h5     %{http_code}\n' https://127.0.0.1:8443/ -H 'Host: wx.product.zhongjianquan.com'
curl -k -s -o /dev/null -w 'h5-api %{http_code}\n' https://127.0.0.1:8443/api/v1/catalog/products -H 'Host: wx.product.zhongjianquan.com'

# 6. 落地 8443 配置
sudo cp deploy/1panel/zjaq-h5-8443.conf /home/1panel/www/conf.d/zjaq-h5-8443.conf
docker exec 1Panel-openresty-o4pb openresty -t
docker exec 1Panel-openresty-o4pb openresty -s reload

# 7. 用户侧：出口设备/NAT 新增 8443 -> 192.168.128.5:8443（本计划不操作）
# 8. 外部访问验证 + 后台登录（POST）与 H5 反馈提交（POST）实测
```

第 3 步可先于第 2 步执行（构建不依赖新 env）；第 6 步若 `nginx -t` 失败，不要 reload，直接删除文件并排查。

## 十、验证清单

1. `https://portal.product.zhongjianquan.com:8443/` 200/307，页面资源加载正常。
2. 门户销售身份**登录 POST** 成功（验证 `PORTAL_PUBLIC_ORIGIN` 带端口生效）。
3. `https://admin.product.zhongjianquan.com:8443/` 200，登录 POST 200（验证 `ALLOWED_ORIGINS` 带端口生效）。
4. 后台上传 ≤ 512 MB 文件成功，且 8443 段 `proxy_request_buffering off` 生效。
5. H5 首页、产品列表、详情、资料预览、图片预览、视频播放逐项通过。
6. H5 反馈表单 POST 200（验证 wx origin 白名单）。
7. `https://wx.product.zhongjianquan.com/`（旧 443 站点）与 `/hrxjs1LgTG.txt` **仍正常**。
8. 现有 443 portal/admin 现状不退化。
9. 备案完成后的回改清单：`ALLOWED_ORIGINS` 去掉 `:8443`（或保留兼容）、`PORTAL_PUBLIC_ORIGIN` 回到 `https://portal.product.zhongjianquan.com`、删除 8443 conf、H5 无需重建、重建 wx 443 归属（届时再单独计划，不与旧 wx 站点冲突）。
10. 产品详情页右上角**两端（H5 与小程序）都不再出现**「本地演示」；同时确认产品一览/资料中心页与资料预览页的同名标记**仍然显示**，确保改动只落在详情页。

## 十一、风险与未验证项

- 本机无 Docker、无 nginx、无 bash，`docker compose config`、`nginx -t`、H5 构建均未实际执行，本计划为静态核对结论。
- OpenResty 实际版本未提供，因此 `http2` 采用兼容写法；`openresty` 二进制名沿用既有验证过的调用方式。
- H5 的 `uni.previewImage` 相对路径行为存在版本差异，列为必测项。
- `apps/mobile` 的 H5 产物体积按 `apps/mobile/dist` 8.6 MB 估算，实际以构建结果为准。
- 8443 能否从公网连通取决于用户侧 NAT 映射，服务器侧无法自证。

## 十二、需用户确认的决策点

1. **端口口径**：是否确认 portal/admin/wx 全部走 `8443`（本计划默认），还是只给 wx 开 8443、portal/admin 继续等 443。
2. **H5 域名**：复用 `wx.product.zhongjianquan.com:8443`（默认，零新增变量），还是另开如 `h5.product.zhongjianquan.com`（需加 `H5_DOMAIN`、改 compose 与模板）。
3. **H5 API 基址**：确认采用相对 `/api/v1`（默认，推荐），还是直接上绝对 `https://wx...:8443/api/v1`。
4. **`PORTAL_PUBLIC_ORIGIN` 改为带端口**：过渡期是否接受门户对外绝对地址带 `:8443`（影响分享链接、邮件链接等）。
5. **镜像 tag**：用 `2026-11-12` 还是 `2026-11-11-h5`；旧 `2026-11-11` 是否保留作回滚。
6. **api 重启窗口**：是否接受 `docker compose up -d` 带来的一次短暂中断（约十几秒）；若不可接受，需要另议「先 reload 8443、次日低峰再改白名单」的分步方案。
7. **是否同意按 4.1～4.9 的文件范围实施**（含可选项 4.7 文档、4.8 健康检查）。
8. **NAT 8443 映射**由用户侧操作，确认何时执行、是否先只放行内网测试。
9. **详情页「本地演示」移除**：已确认两端都删除（不加条件编译），见 4.9 与 13.2。

确认后我再按本计划实施；实施时如有与仓库实际不符处，会先说明差异再调整，不自行扩大范围。

## 十三、实施记录（2026-11-11）

### 13.1 用户确认口径

1. 三域全部上线 8443；2. H5 挂 `wx.product.zhongjianquan.com:8443`、API 用相对 `/api/v1`；3. 接受 `ALLOWED_ORIGINS` 与 `PORTAL_PUBLIC_ORIGIN` 带 `:8443`；4. 接受 api/portal 重建的十几秒中断；5. 详情页「本地演示」改为**两端都删除**（不再条件编译），另两处不动。

### 13.2 实际改动（6 个文件，`compose.yml` 未改）

| 文件 | 改动 |
|---|---|
| `deploy/scripts/build-images.sh` | 新增 `H5_API_BASE="/api/v1"`；新增 `VITE_API_BASE_URL="$H5_API_BASE" pnpm build:h5`；web 上下文新增 `cp -r apps/mobile/dist/build/h5 "$WEB_CTX/h5"`；末尾提示改为「web 镜像含 admin 与 h5」 |
| `deploy/docker/Dockerfile.web` | 头部注释改为 admin + h5；新增 `COPY h5 /usr/share/nginx/html/h5` |
| `deploy/nginx/default.conf.template` | 头部域名口径注释改写；wx 443 块由 `return 404` 改为 `root /usr/share/nginx/html/h5` + `/assets/` 缓存 + `try_files ... /index.html`，`location /api/` 原样保留 |
| `deploy/env/.env.example` | `ALLOWED_ORIGINS` 增加 `https://admin...:8443` 与 `https://wx...:8443`；`PORTAL_PUBLIC_ORIGIN` 改为带 `:8443`；注释说明备案后回改；`ALLOWED_HOSTS` 不变 |
| `deploy/1panel/zjaq-h5-8443.conf` | **新建**，三个 8443 server 块，证书用容器内绝对路径，SSL 共享缓存 `ZJAQ_8443_SSL` |
| `apps/mobile/src/pages/detail/index.vue` | 第 135 行整段删除 `<text class="v2-demo">本地演示</text>`，H5 与小程序都不再显示 |

未做：`deploy/compose.yml`、`docs/production-deployment.md`、`deploy/scripts/healthcheck.sh`、`deploy/1panel/zjaq-product-platform.conf`（其头部仍写「H5 不参与」，属既有 443 模板，本轮未列入批准范围）。

### 13.3 本机静态校验（实测结果）

- `default.conf.template`：`server` 块 4 个、`listen 443 ssl;` 3 个、`http2 on;` 3 个、`ssl_certificate /etc/nginx/certs/...` 3 个、`/usr/share/nginx/html/h5` 1 处、`proxy_pass http://api:3100;` 2 处（admin `/api/v1/` 与 wx `/api/`）；`${...}` 变量仅 `PORTAL_DOMAIN`/`ADMIN_DOMAIN`/`WX_DOMAIN`；`H5 不参与`、`return 404` 残留均为 0；花括号 21/21 平衡。
- `zjaq-h5-8443.conf`：`server` 块 3 个、`listen 8443 ssl http2;` 3 个、`ssl_certificate`/`ssl_certificate_key` 各 3 个、占位符残留 0、花括号 6/6、缓存名唯一 `shared:ZJAQ_8443_SSL:10m`、`Host` 变量统一为 `$host`。
- 构建链路一致性：`package.json` 存在 `build:h5`；脚本第 26/37/52 行与 `Dockerfile.web` 第 11 行的路径 `apps/mobile/dist/build/h5` → `$WEB_CTX/h5` → `/usr/share/nginx/html/h5` 三段对齐。
- 文案：`apps/mobile/src` 共 3 处「本地演示」，仅 `pages/detail/index.vue:135` 删除（该行已无 `v2-demo` 节点），`components/CatalogView.vue:268` 与 `pages/viewer/index.vue:215` 保持原样。
- `.env.example`：`ALLOWED_ORIGINS` 三个值无尾斜杠；`PORTAL_PUBLIC_ORIGIN` 带 `:8443`；`ALLOWED_HOSTS` 未含端口。

### 13.4 未验证项（限制）

本机无 Docker、无 nginx、无 bash：`docker compose config`、`nginx -t`、`pnpm build:h5`、`docker build` 均未执行；H5 产物结构与 uni-app 的 `assets/` 目录名、`uni.previewImage` 相对路径行为、OpenResty 版本对 `http2` 参数的兼容性，都必须在目标机上验证。静态校验不能替代这些运行期证据。

### 13.5 回滚

- 仅撤 8443：删除 `/home/1panel/www/conf.d/zjaq-h5-8443.conf` → `openresty -t` → `-s reload`。
- 撤 UI 改动：把 `<text class="v2-demo">本地演示</text>` 插回 `detail/index.vue` 第 135 行按钮之后 → 重建 web 镜像。
- 撤全部：`IMAGE_TAG` 回 `2026-11-11` + `.env` 恢复 `ALLOWED_ORIGINS`/`PORTAL_PUBLIC_ORIGIN` → `docker compose up -d`。
