# 生产部署目录

本目录是 Docker 生产部署的完整配置，正式步骤见 [部署手册](../docs/production-deployment.md)。

## 目录

| 路径 | 用途 |
| --- | --- |
| `compose.yml` | mysql 5.7 + api + portal + nginx 的运行编排 |
| `docker/` | API / Portal / 静态站点三个镜像的 Dockerfile |
| `nginx/` | 四子域名反向代理与 TLS 模板 |
| `env/.env.example` | 生产环境变量模板（复制为 `.env` 后填写） |
| `scripts/` | 构建、导出、导入、启动、初始化、备份恢复、健康检查 |

## 最短路径

```bash
# 构建机（有 Docker 与网络）
cp deploy/env/.env.example deploy/.env   # 填写域名与密码
deploy/scripts/build-images.sh
deploy/scripts/save-images.sh

# 目标服务器（只需 deploy/ 与镜像包）
deploy/scripts/load-images.sh zjaq-images-<tag>.tar.gz
deploy/scripts/deploy.sh
deploy/scripts/init-admin.sh admin '<至少 8 位密码>'
```

注意：`deploy/.env`、`deploy/certs/`、`deploy/backups/` 均不应提交到仓库。
