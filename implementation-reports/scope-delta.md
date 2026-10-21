# TASK-00 范围与来源映射

第一轮范围：TASK-00／TASK-01；确认记录见 plans 中同名计划。

| 输入 | 工作副本／处理 |
| --- | --- |
| 原交付包全部文件 | delivery/v4-rc2，不在应用 public／dist 中 |
| contracts | contracts；仅修改搜索长度、模板版本查询两项 |
| data／templates／design | 同名工作目录；运行期通过共享包消费 |
| 原 64 项验收定义 | tests/acceptance-cases.json 等原样保留 |
| 新代码与测试 | apps、services、packages、scripts、tests/unit |
| 新执行证据 | implementation-reports；临时日志在 work |

V3 localStorage 业务库、客户端角色与审核／授权／原件下载路线全部不迁入新工程。
本轮没有编辑、创建、发布、下架、上传等写业务接口；未实现请求返回明确不可用，不伪造成功。

9 个读取接口：
- GET /api/v1/catalog/categories
- GET /api/v1/catalog/products
- GET /api/v1/catalog/products/{productId}（当前没有公开内容，返回 404）
- GET /api/v1/catalog/materials
- GET /api/v1/admin/me
- GET /api/v1/admin/categories
- GET /api/v1/admin/templates
- GET /api/v1/admin/products
- GET /api/v1/admin/products/{productId}/draft

另有仅本地使用的 /health。Mock 绑定 127.0.0.1，无写入持久化，仅提供默认草稿快照。
模拟身份是固定本地开发标记 local-mock，不是真实认证。APP_ENV=production 或 NODE_ENV=production 禁止启动 Mock。
正式 API 在配置缺失或真实适配器未实现时退出，不自动回退 Mock。

原计划中“本次只读”的文字记录的是规划阶段。用户确认后本轮已开始代码实施，不应将规划阶段描述误认为当前执行状态。
