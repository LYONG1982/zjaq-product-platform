# 1Panel OpenResty 前置反向代理改造计划（方案 B）

日期：2026-11-10。状态：用户已批准；仓库侧改动与本地结构校验完成，服务器侧等待域名、证书与目标机操作。本轮未连接目标机。

## 一、背景与现场事实

- 目标服务器可联网，镜像按 `docs/production-deployment.md` 第 15 章在服务器本机构建。
- 1Panel 的 OpenResty 容器 `1Panel-openresty-BGeE` 使用 host 网络，实际占用宿主机 80/443，承载其他多个站点，且 1Panel 面板本身也经它访问。
- 1Panel「网站」计数为 0，但 OpenResty 的 `conf.d` 内确有站点配置。**不能以面板 UI 作为配置事实来源**。
- 按原文档 15.2 停用 OpenResty 后，现有站点与面板同时中断，已用 `docker start` 回滚。方案 A（停 OpenResty、`web` 直接占 80/443）被否决。
- 现行 `deploy/compose.yml` 中 `web` 发布 `80:80`、`443:443`，固定 IP `172.28.0.10`；API 的 `TRUSTED_PROXY_ADDRESSES` 默认 `172.28.0.10`。

## 二、目标与非目标

目标：

1. OpenResty 继续作为唯一对外 80/443 入口，现有站点与面板不受影响。
2. `zjaq/web` 只绑定 `127.0.0.1:8080`，仅经 OpenResty 访问。
3. `portal` / `admin` / `h5` / `api` 四个子域由新增的独立 OpenResty 配置文件反代到 `web`。
4. 不修改他人站点配置、不重建 OpenResty 容器、不改其网络模式，只做「新增文件 + 语法检查 + reload」。
5. 保留真实客户端 IP 解析能力，并能在目标环境实测校验。

非目标：

- 不在本轮实施；不碰线上现有站点配置。
- 不把 `web` 的 nginx 模板改成明文 8080（该方案需要重建镜像，风险更高，留作备选）。
- 不迁移 MySQL、不改域名、不申请证书（域名与证书待定，计划只留占位符和替换点）。

## 三、关键决策与取舍

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| TLS 终止位置 | OpenResty 对外终止；`web` 内部仍用 443 TLS | 不改 `deploy/nginx/default.conf.template`，不重建 `web` 镜像；内网回环多一次 TLS，代价可接受 |
| `web` 暴露方式 | `127.0.0.1:8080:443` | 只允许本机 OpenResty 访问，宿主机外不可直连 |
| `web` 固定 IP | 保留 `172.28.0.10` | API 需要按固定地址识别 `web` 这一跳，动态 IP 会让可信链失效 |
| 入站 XFF | OpenResty 覆盖为 `$remote_addr` | 防止客户端伪造 `X-Forwarded-For`；`web` 现有模板继续追加一跳 |
| 客户端 IP 可信链 | `TRUSTED_PROXY_ADDRESSES=172.28.0.10,<实测跳地址>` | API 从右向左走链，必须认识 OpenResty→web 的实际来源地址 |
| 证书 | 一张覆盖四域的 SAN 或通配符证书 | `web` 只有一对证书文件，无法同时使用四张单域证书 |
| 共存方式 | 新增独立 conf 文件 | 不改他人配置，回滚只需删文件并 reload |

## 四、变更清单

### 4.1 仓库内文件

1. `deploy/compose.yml`：仅改 `web.ports`。

   ```yaml
   ports:
     - "127.0.0.1:8080:443"
   ```

   删除原来的 `"80:80"` 与 `"443:443"`；`networks.zjaq.ipv4_address: 172.28.0.10` 保持不变。

2. `deploy/env/.env.example`：补充 `TRUSTED_PROXY_ADDRESSES` 注释，说明方案 B 需追加 OpenResty→web 的实测来源地址，默认值仍保留 `172.28.0.10`。

3. `docs/production-deployment.md`：确认实施前先插入一条警示，标注「方案 A 已否决，禁止停用 OpenResty」；实施并验证通过后，再把第 15 章整体改为方案 B，补充本节的反代与 IP 校验内容。

4. 不改 `deploy/nginx/default.conf.template`、`deploy/docker/*`、`deploy/scripts/*`。

### 4.2 服务器运行侧文件

1. 1Panel 编排项目内的 compose 副本：`/opt/1panel/docker/compose/zjaq/docker-compose.yml`，与仓库 `deploy/compose.yml` 同步修改。
2. 编排项目 `.env`：若为软链接则改 `/opt/zjaq/deploy/.env`；新增实测跳地址到 `TRUSTED_PROXY_ADDRESSES`。
3. 新增 OpenResty 配置：`/opt/1panel/apps/openresty/openresty/conf/conf.d/zjaq-product-platform.conf`（实际目录以 `docker inspect` 挂载为准）。
4. 新增证书目录：`/opt/1panel/apps/openresty/openresty/www/sites/zjaq-product-platform/ssl/{fullchain.pem,privkey.pem}`（占位，见 4.4）。

## 五、详细设计

### 5.1 端口与固定 IP

`web` 改为只发布回环 8080，映射到容器内 443：

- 外部访问路径：客户端 → OpenResty `:443`（host 网络）→ `https://127.0.0.1:8080` → `web` 容器 `:443` → `portal:3000` / 静态文件 / `api:3100`。
- `web` 容器仍监听 443 并使用现有证书，`deploy/nginx/default.conf.template` 不变。
- 固定 IP `172.28.0.10` 必须保留：API 看到的对端是 `web`，这是可信链的起点。
- 不把 8080 发布到 `0.0.0.0`，避免绕过 OpenResty 直连。

### 5.2 请求链与真实客户端 IP

请求链：

```
客户端 --TLS--> OpenResty(host:80/443) --TLS--> 127.0.0.1:8080 -> web(172.28.0.10) -> api
```

头处理：

- OpenResty 每个 server 块设置：
  - `proxy_set_header Host $host;`
  - `proxy_set_header X-Real-IP $remote_addr;`
  - `proxy_set_header X-Forwarded-For $remote_addr;`（覆盖，不追加，丢弃客户端自带值）
  - `proxy_set_header X-Forwarded-Proto $scheme;`
- `web` 现有模板使用 `$proxy_add_x_forwarded_for`，会把 OpenResty 到 web 的实际来源地址追加到链尾。
- API 的 `sourceIp()` 从对端 `172.28.0.10` 开始，自右向左走链，遇到第一个不可信地址停止。因此必须把「OpenResty→web 的实际来源地址」加入 `TRUSTED_PROXY_ADDRESSES`，否则 API 记录的是该跳地址而不是真实客户端。

实测跳地址的方法（实施阶段执行，不靠猜测）：

```bash
# 触发一次经 OpenResty 的请求后，查看 web 的访问日志（默认格式含 $remote_addr）
docker exec <web 容器名> tail -n 20 /var/log/nginx/access.log
```

预期为 `172.28.0.1`（`zjaq` 网桥网关），但必须实测确认。确认后：

```dotenv
TRUSTED_PROXY_ADDRESSES=172.28.0.10,<实测地址>
```

然后 `docker compose up -d api` 让新配置生效。

安全边界：

- 8080 只绑回环，只有宿主机本地进程可直连。
- 信任网桥网关比信任专用代理容器范围更宽，但本项目 API 未发布宿主端口，其他容器直连 API 时源地址是各自容器 IP，不是网关，不能借此伪造。仍需做伪造头验证。
- 若实测地址不稳定或与预期不符，停止实施，回到计划阶段，不把网段或网关地址写成通配。

### 5.3 OpenResty 四份 server 块模板

文件：`/opt/1panel/apps/openresty/openresty/conf/conf.d/zjaq-product-platform.conf`

占位符替换点：`<PORTAL_DOMAIN>`、`<ADMIN_DOMAIN>`、`<H5_DOMAIN>`、`<API_DOMAIN>`、`<CERT_DIR>`。

```nginx
# zjaq-product-platform：四子域名反代到本机 web:8080
# 占位符：<PORTAL_DOMAIN> <ADMIN_DOMAIN> <H5_DOMAIN> <API_DOMAIN> <CERT_DIR>
# <CERT_DIR> 例如 /www/sites/zjaq-product-platform/ssl

server {
    listen 80;
    server_name <PORTAL_DOMAIN> <ADMIN_DOMAIN> <H5_DOMAIN> <API_DOMAIN>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name <PORTAL_DOMAIN>;

    ssl_certificate     <CERT_DIR>/fullchain.pem;
    ssl_certificate_key <CERT_DIR>/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:ZJAQ_SSL:10m;
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
    listen 443 ssl http2;
    server_name <ADMIN_DOMAIN>;

    ssl_certificate     <CERT_DIR>/fullchain.pem;
    ssl_certificate_key <CERT_DIR>/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:ZJAQ_SSL:10m;
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
    listen 443 ssl http2;
    server_name <H5_DOMAIN>;

    ssl_certificate     <CERT_DIR>/fullchain.pem;
    ssl_certificate_key <CERT_DIR>/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:ZJAQ_SSL:10m;
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
    listen 443 ssl http2;
    server_name <API_DOMAIN>;

    ssl_certificate     <CERT_DIR>/fullchain.pem;
    ssl_certificate_key <CERT_DIR>/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:ZJAQ_SSL:10m;
    ssl_session_timeout 10m;

    # 单文件上限 500 MiB，给代理层余量；与 web 内 512m 保持一致
    client_max_body_size 512m;
    client_body_timeout 120s;

    location / {
        proxy_pass https://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_ssl_name $host;
        proxy_ssl_verify off;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

说明：

- **TLS**：公开证书由 OpenResty 加载；`web` 继续用同一张 SAN 证书终止内部回环 TLS。`proxy_ssl_verify off` 只作用于回环，不对外部客户端放宽校验。
- **HTTP→HTTPS**：单独的 80 server 块只匹配四个域名，其他 Host 仍由现有默认站点处理。
- **上传上限**：portal/admin/h5 为 32m；api 为 512m，并在 web 侧保留原有 512m，避免在任一跳被 413。
- **PDF.js MIME**：`.mjs` / `.wasm` 的 `Content-Type` 由 `web` 内现有 nginx 模板设置，OpenResty 只做透传，不重复定义；上线后必须用 `curl -I` 实测。
- **HTTP/2 写法**：使用 `listen 443 ssl http2;` 兼容较旧 OpenResty；若目标版本 ≥1.25.1，也可改为 `listen 443 ssl; http2 on;`。以 `nginx -t` 结果为准。
- **共享缓存名**：使用独立的 `shared:ZJAQ_SSL:10m`，避免与现有配置的 `shared:SSL` 冲突。
- **不添加 `default_server`**，不修改 `server_name` 之外的全局指令，避免影响面板和其他站点。

### 5.4 证书来源与路径

占位方案：

- 宿主目录：`/opt/1panel/apps/openresty/openresty/www/sites/zjaq-product-platform/ssl/`
- OpenResty 容器路径：`/www/sites/zjaq-product-platform/ssl/`
- `web` 的 `TLS_DIR` 指向同一宿主目录，只读挂载，保证只有一份证书。
- 证书必须覆盖四个子域名（SAN 或 `*.<父域>`），文件名固定 `fullchain.pem`、`privkey.pem`。
- 续期：替换上述两个文件 → `docker exec 1Panel-openresty-BGeE openresty -s reload` → 重启 `web` 容器。
- 若现场已有多张单域证书，需先合并为一张 SAN 证书；不能把某一张单域证书同时给四个 server 块使用。

### 5.5 与现有手写站点配置共存

实施前只做只读勘察：

```bash
docker inspect 1Panel-openresty-BGeE \
  --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
ls -l /opt/1panel/apps/openresty/openresty/conf/conf.d/
grep -R "server_name" /opt/1panel/apps/openresty/openresty/conf/conf.d/
```

要求：

- 新增文件命名唯一，不覆盖、不改写任何现有 `.conf`。
- 若现有配置已声明四个目标 `server_name`，停止实施并先确认归属。
- 若现有配置使用 `default_server`，保持不变；我们的块只按精确域名匹配。
- 只执行 `nginx -t` 与 `-s reload`，不 restart 容器、不改网络模式、不改挂载。
- 1Panel「网站」计数为 0，说明该配置不受面板管理；需在计划记录中注明「手工维护，升级面板前先备份」。

## 六、实施顺序（不停现有站点）

1. **备份**
   - `deploy/compose.yml`、`/opt/1panel/docker/compose/zjaq/docker-compose.yml`
   - `/opt/zjaq/deploy/.env`
   - `conf.d` 整目录打包：`tar czf /root/openresty-conf-<时间>.tar.gz -C /opt/1panel/apps/openresty/openresty/conf conf.d`
   - 记录现有站点与面板的 `curl` 状态码作为基线。
2. **准备证书**：按 5.4 放入占位目录；先用 `openssl x509 -noout -text` 核对 SAN。
3. **改 compose（先在仓库，再同步编排目录）**：只改 `web.ports` 为 `127.0.0.1:8080:443`。
4. **启动 web**：在编排目录 `docker compose up -d web`。此步不动 80/443，现有站点不受影响。
5. **直连验证 web**：
   ```bash
   curl -k -sS -o /dev/null -w '%{http_code}\n' \
     --resolve portal.<域名>:8080:127.0.0.1 https://portal.<域名>:8080/
   ```
   四个域名逐一验证；失败则回滚 compose，不进入下一步。
6. **写入 OpenResty 新配置**，执行：
   ```bash
   docker exec 1Panel-openresty-BGeE openresty -t
   docker exec 1Panel-openresty-BGeE openresty -s reload
   ```
   若 `-t` 失败：不 reload，保留新文件供排查或删除后重试；现有配置仍在内存中运行。
7. **经 OpenResty 验证四域名**：
   ```bash
   curl -k -sS --resolve api.<域名>:443:127.0.0.1 https://api.<域名>/health
   ```
8. **实测跳地址**：查看 `web` 访问日志中的 `$remote_addr`，把结果写入 `.env` 的 `TRUSTED_PROXY_ADDRESSES`，执行 `docker compose up -d api`。
9. **验证真实 IP 与伪造头**：带 `X-Forwarded-For: 1.2.3.4` 请求，确认访问记录/日志显示真实客户端而非伪造值。
10. **完整验收**（见第八节），并复核现有站点与面板状态码与基线一致。
11. **更新文档**：把 `docs/production-deployment.md` 第 15 章改为方案 B，记录实际跳地址、证书路径与验证证据。
12. **归档计划**：完成后移入 `plans/archive/`。

## 七、回滚

按影响面从大到小：

1. **仅回滚 zjaq 路由**（最常用）：
   ```bash
   rm -f /opt/1panel/apps/openresty/openresty/conf/conf.d/zjaq-product-platform.conf
   docker exec 1Panel-openresty-BGeE openresty -t
   docker exec 1Panel-openresty-BGeE openresty -s reload
   ```
   `web` 留在 8080 不影响现有站点，可稍后处理。
2. **回滚 IP 信任**：`TRUSTED_PROXY_ADDRESSES` 去掉实测跳地址，`docker compose up -d api`。
3. **回滚 compose 端口**：从备份恢复 `deploy/compose.yml` 与编排目录副本；若 OpenResty 已不再占用 80/443，再 `docker compose up -d web`。若 OpenResty 仍占用，不要恢复 80/443 发布，否则 `web` 无法启动。
4. **回滚证书**：恢复备份的证书目录；不影响其他站点证书。
5. **配置级回滚**：现有站点配置全程未改，无需回滚；若 reload 后出现异常，删除新文件并再次 reload 即可恢复。
6. 回滚后重新执行现有站点与面板的基线检查。

## 八、验证清单

目标环境逐项执行并留存命令输出：

- [ ] `openresty -t` 通过；reload 无错误日志。
- [ ] 1Panel 面板可正常登录。
- [ ] 现有站点状态码与变更前基线一致。
- [ ] 四个域名 HTTP 80 返回 301 到 HTTPS。
- [ ] `https://api.<域名>/health` 返回 `status: ok`，`capabilities.video` 为 `ready`。
- [ ] `https://admin.<域名>/` 可登录，创建/发布产品、上传资料正常。
- [ ] `https://h5.<域名>/` 免登录浏览，PDF 预览正常。
- [ ] `https://portal.<域名>/` 销售账号可登录浏览。
- [ ] `.mjs` 返回 `Content-Type: application/javascript`，`.wasm` 返回 `application/wasm`。
- [ ] 视频 Range 请求返回 206，不被代理缓冲破坏。
- [ ] 上传 >100 MiB 文件不报 413；条件允许时验证 500 MiB 边界。
- [ ] 伪造 `X-Forwarded-For: 1.2.3.4` 不改变实际记录的客户端 IP。
- [ ] API 记录的是真实客户端 IP，不是 `172.28.0.1` 或 `172.28.0.10`。
- [ ] `docker volume ls` 仍为 `zjaq_mysql-data` / `zjaq_private-storage`。
- [ ] 重启服务器后 OpenResty、编排内服务均自动恢复。
- [ ] `conf.d` 中除新增文件外无其他改动（与备份 diff）。

## 九、需目标环境确认的项

1. OpenResty 容器实际名称、conf.d 与 www 的宿主挂载路径（以 `docker inspect` 为准）。
2. OpenResty 版本与可用指令：`http2` 写法、TLS 1.3、`openresty`/`nginx` 二进制名。
3. OpenResty→web 的实际来源地址是否稳定为网桥网关；不稳定则方案需重做。
4. 四个真实域名、DNS 解析与证书 SAN 覆盖范围；证书由谁签发、续期方式。
5. 是否存在 IPv6 AAAA 记录；若需要，server 块要补 `listen [::]:443 ssl http2;`。
6. OpenResty 现有配置是否已占用四个目标 `server_name`。
7. 1Panel 面板自身的域名/端口是否与新增配置冲突；reload 是否影响面板长连接。
8. 1Panel 升级或修复是否可能覆盖 `conf.d` 手工文件。
9. 双层 TLS 与 512 MiB 上传在目标带宽/磁盘下的实际耗时与内存占用。
10. 宿主机防火墙与云安全组只放行 80/443，8080 不对外。

## 十、风险与限制

- 信任网桥网关地址扩大了可信代理范围；通过「仅回环发布 8080 + 覆盖入站 XFF + 伪造头实测」降低风险，但不能等同于专用代理容器。
- 双层 TLS 增加少量 CPU 与握手开销；内网回环，通常可接受。
- reload 是平滑重载，但仍会短暂影响所有站点的连接建立；必须先在 `nginx -t` 通过后执行，并准备好删除文件回滚。
- 1Panel「网站」计数为 0，新增配置不在面板管理内，后续运维需按本计划手工维护并备份。
- 证书续期需要同时保证 OpenResty 与 web 读到新文件；遗漏会导致 web 继续使用旧证书。
- 以上均为目标环境待验证项，本地无法用构建成功推断通过。

## 十一、待用户确认

1. 是否批准按本计划实施。
2. 四个真实域名与证书来源（SAN/通配符、签发方式）。
3. 是否接受 `TRUSTED_PROXY_ADDRESSES` 追加实测跳地址（预期 `172.28.0.1`）；若要求不扩大信任范围，需要改为在 web 模板做 `real_ip`，那将涉及重建镜像，需另立计划。
4. 确认可接受「只新增 conf 文件 + `nginx -t` + reload」的变更方式。

## 十二、实施记录（仓库侧，2026-11-10）

用户于 2026-11-10 批准实施，但未提供四个真实域名与证书。按批准范围只完成仓库侧改动与本地校验，未连接目标机，未执行任何 reload、容器重启或远程命令。

### 12.1 已改文件

1. `deploy/compose.yml`：`web.ports` 由 `80:80` + `443:443` 改为 `127.0.0.1:8080:443`；固定 IP `172.28.0.10` 与卷、网络配置未动。
2. `deploy/env/.env.example`：`TRUSTED_PROXY_ADDRESSES` 上方补充两跳说明，默认值保持 `172.28.0.10`。
3. `deploy/1panel/zjaq-product-platform.conf`：新增四子域 OpenResty 反代模板，含 80→443 跳转、四份 443 server 块、api 的 512m 与关闭缓冲、32m 的其他域、Host/XFF/XFP 透传、独立 SSL 共享缓存名；域名与证书目录为占位符。
4. `docs/production-deployment.md`：第 15 章顶部加入「方案 A 已否决、严禁停用 OpenResty」警示；15.1 结论改为方案 B；15.2 第 4 步改为禁止停用；15.3 的 `TLS_DIR` 与 15.5 的证书申请改为 OpenResty 共用证书；15.3、15.9 同步两跳 IP 说明；15.10 改为剩余待办。
5. 本计划状态与本节实施记录。

### 12.2 本地校验

- `node` + 仓库内 `yaml` 解析 `deploy/compose.yml`：`web.ports=["127.0.0.1:8080:443"]`，`web.ip=172.28.0.10`。
- 模板结构检查：花括号 9/9 平衡；`server {` 5 个（1 个 80 + 4 个 443）；`listen 443 ssl http2;` 4 个；`ssl_certificate` 4 个；`proxy_pass https://127.0.0.1:8080;` 4 个；占位符仅 `<PORTAL_DOMAIN>`、`<ADMIN_DOMAIN>`、`<H5_DOMAIN>`、`<API_DOMAIN>`、`<CERT_DIR>`。
- 未执行：`docker compose config`、`nginx -t`、镜像构建。本机无 Docker/nginx，不能把结构检查当作语法验证。

### 12.3 上服务器前仍缺

1. 四个真实域名与 DNS 解析。
2. 覆盖四域的 SAN/通配符证书及签发/续期方式。
3. OpenResty 容器实际名称、`conf.d` 与 `www` 的宿主挂载路径。
4. OpenResty 版本（确认 `listen ... http2` 写法）与二进制名。
5. OpenResty→web 实测来源地址（用于 `TRUSTED_PROXY_ADDRESSES`）。
6. 目标机现有站点与面板的访问基线、`conf.d` 备份。
7. 现有 `work/release/2026-11-10` 源码 tar 早于本次改动，上服务器前需重新打包或直接从仓库拉取，否则仍带旧的 80/443 端口配置且没有反代模板。
8. 以上就绪后，按第六节顺序在目标机执行；服务器侧仍须逐项验证，不能以仓库改动推断通过。

## 十三、补充记录（2026-11-11）：API 镜像构建换用阿里云 Debian 源

### 13.1 原因

目标服务器构建 `zjaq/api` 镜像时，`apt-get install ffmpeg` 从 `deb.debian.org` 拉取极慢（89 分钟只推进到 175 个包中的少数），导致镜像构建无法在可接受时间内完成。服务器副本上已手工改为阿里云镜像源，仓库权威版本需同步，避免下次打源码包又带回慢源。

### 13.2 改动位置

仅 `deploy/docker/Dockerfile.api`：在 `RUN apt-get update` 之前新增一行独立 `RUN`（含原因注释）：

```dockerfile
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true
```

- 基础镜像为 `node:22-bookworm-slim`（Debian 12），默认 deb822 格式，配置实际位于 `/etc/apt/sources.list.d/*.sources`，因此两个路径都覆盖。
- `/etc/apt/sources.list` 在 bookworm 上通常不存在，`2>/dev/null || true` 用于忽略缺失文件；`sed` 对存在的文件仍会完成替换。
- 未改动 `deploy/compose.yml`、其他 Dockerfile、部署脚本与业务代码。

### 13.3 影响与回滚

- 影响面：仅 API 镜像构建期的 apt 下载源，运行期行为不变；镜像内容除 apt 包版本来源外无差异。
- 回滚：删除该 `RUN` 行（及其两行注释）即恢复官方 `deb.debian.org`，重新 `docker build` 即可。
- 未验证：本机无 Docker，未实际构建；目标机构建是否恢复正常下载速度、`apt-get update` 是否成功，均须在服务器上验证后才可视为通过。

### 13.4 打包提示

`work/release/2026-11-11/zjaq-source-2026-11-11.tar.gz` 早于本改动，其中 `Dockerfile.api` 仍是官方源；重新分发前需重新打包（本轮按用户要求未重新打包）。
