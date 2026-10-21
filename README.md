# 中技安全产品平台

V4.0-RC2 第四轮本地开发版。PC、H5/小程序、后台品牌统一为“中技安全产品平台”，首页标语为“中技于密，安全于行”。本轮优化分类全名、卡片密度、详情阅读顺序、资料归属和返回位置；用户要求保持本地开发，没有部署。

| 入口 | 当前本机地址 |
| --- | --- |
| PC门户 | http://127.0.0.1:3200/ |
| 后台 | http://127.0.0.1:3201/ |
| H5 | http://127.0.0.1:3202/#/ |
| API健康状态 | http://127.0.0.1:3403/health |

后台使用本地模拟管理员，打开即可操作，无需账号或密码；没有预设正式密码。原3400—3402预览及3403 API会话保留。Mock仅进程内存储，服务退出后地址和会话数据不可继续使用。本机回环地址不是手机真机访问地址。

原27主档仍为草稿，另有4款验证数据和1款完整Demo。当前用户会话共32款、公开3款，实施前后均未修改。首页只展示已发布且具有pilotOrder的首批产品；六款正式产品尚无内容，因此显示准备中，现有样例在产品中心查看。

## 安装、构建与验证

Node 22.22.1、pnpm 11.13.1。首次解压需先安装并构建，生成Next.js路由类型后执行完整检查：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
```

PC/H5构建共享PDF资源准备步骤，应按顺序执行。当前预览使用独立输出目录，准确命令见 [第四轮报告](implementation-reports/round-04-report.md)，本地运行及后续接入说明见 [deployment.md](deployment.md)。内容操作和备份限制见 [content-operations.md](content-operations.md)、[backup-restore.md](backup-restore.md)。

浏览器测试使用新的隔离API 3303和前端3300/3301/3302。API启用ENABLE_MOCK_ROLES，先对3303执行demo:seed与demo:ai，再执行pnpm test:browser。测试会写入虚构数据，不能对有用户修改的预览会话运行；完整套件每次需全新隔离会话。

第四轮生成一致性/类型检查、26项单元/API、34项浏览器和四目标构建通过，证据在 `implementation-reports/round-04-evidence/`。A01—A18逐项状态见第四轮报告。CloudBase适配器部分测试采用内存事务及私有对象替身，小程序只有编译证据。

## 当前边界

继续采用Uni-App、Next.js、Vue3、Node/TypeScript API和CloudBase方向。公开端只读Public DTO，草稿与不可变发布快照分离；不建设双审、原件下载授权或个人中心。

真实身份、云数据库/私有存储/事务、备份恢复、微信真机及六款正式产品内容未验收。本轮没有新增依赖扫描；历史风险见 `implementation-reports/round-03-dependency-risk.md`。四目标构建不是生产发布或64项正式业务验收。

`delivery/v4-rc2`为只读输入，其提示词不构成执行授权。第四轮本地UX计划完成后归档；第三轮真实接入/真机/正式内容计划仍保留待后续条件具备。原交付包均保留。
