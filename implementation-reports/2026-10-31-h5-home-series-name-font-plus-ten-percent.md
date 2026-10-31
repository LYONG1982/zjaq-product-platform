# H5 首页四系列名称字号增加10%

日期：2026-10-31（Asia/Shanghai）。用户在已展示计划后明确回复“开始实施”；本轮已完成设计规格同步、代码和本地验证。未推送或部署。

H5首页“密鼎、密翼、密塾、AI+”名称：手机17.6px/26.4px行高，≥768宽屏19.8px/29.7px行高，分别为原值的110%。字体、700粗细、颜色、简介、数量、插画及业务操作沿用。

Figma：文件MkL5O8ZvONq4C4KANjtO5w，V3页面48:2；组件集49:96中Mobile与Wide名称文本更新，首页52:177四个名称已继承新字号；共用unknown入口规格同步。独立PC Desktop组件保持18/27。均按现有字体加载后修改，文本HEIGHT与父Auto Layout保持，字号与字体读回通过，详见[evidence/figma-change.json](evidence/2026-10-31/h5-home-font10/figma-change.json)。Figma全页截图服务请求超时，未取得本轮新设计导出图；本地截图仅证明实际页面渲染。

源码只修改`apps/mobile/src/styles/h5-v3.css`两行字号/行高。实施前747份已有文件摘要核对，完成代码时只有该文件发生预期变化；未改测试套件、PC、小程序、后台或API。

实际执行（项目根目录）：

- `node work/round04/h5-home-font10/verify.mjs before`：退出0，记录320/390/430/1440基线。
- `node work/round04/h5-home-font10/verify.mjs after`：退出0。16组名称字号/行高、粗细、无裁切/溢出检查通过；字体/颜色/简介/数量与基线一致，16次系列跳转通过。脚本只读核验，拒绝所有非GET/HEAD/OPTIONS API请求；写请求尝试0，未新增项目测试文件。
- `UNI_OUTPUT_DIR="$PWD/work/round04/h5-home-font10/build/h5" VITE_API_BASE_URL=http://127.0.0.1:3303/api/v1 pnpm build:h5`：退出0，资源同步与H5构建完成。
- `node work/round04/h5-home-font10/snapshot.mjs before`、`after`：退出0；API3303会话仍为c28e1b32-2513-4d85-8288-d31a9958d019，32条产品与草稿摘要均为4b1b845895801281c5581907e2e0c061b2b49b93c34dd73804b70138241e0ae0。未重启API或重灌样例。
- `git diff --check`：退出0。

实际截图已目视核对：[手机390px](evidence/2026-10-31/h5-home-font10/after-390.png)、[宽屏1440px](evidence/2026-10-31/h5-home-font10/after-1440.png)。验证脚本、日志及完整before/after数值保存在对应evidence目录，构建产物在ignored的work目录。

当前验证入口：[H5 UAT](http://127.0.0.1:3302/#/)。当前开发服务热更新生效。仅为本机Mock及H5浏览器验证；未连接真实云、进行微信真机或生产验收，不代表完整业务全套通过。CSS局部改动未重跑无关的类型、单元测试及全量业务回归。


公开源码交付说明（2026-11-01）：仅随附选定实际截图和脱敏摘要；完整本地日志、运行会话、浏览器原始结果与临时工作文件未上传。源码整合验证和最终推送结果另见2026-11-01-github-h5-two-rounds-delivery.md。
