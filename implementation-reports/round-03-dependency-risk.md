# 第三轮依赖整改记录

2026-10-19，本轮实际 `pnpm audit --json` 记录为 **5 high、14 moderate、3 low、0 critical**；未通过安全清零，不视为可发布结论。原第二轮记录为 18 high、25 moderate、8 low；加入 CloudBase SDK 后曾增至 29 high、40 moderate、9 low，再按兼容版本修复。不同阶段依赖图不同，不把数量变化等同攻击面按比例降低。

通过兼容 override 更新 axios、lodash.unset、jpeg-js、qs、postcss、source-map-js、ws、@intlify/core-base/shared、@intlify/message-resolver、postcss-selector-parser 6、adm-zip、cookie、send、path-to-regexp、body-parser。精确映射以 pnpm-workspace.yaml 为准。锁文件保留，strictPeerDependencies 与安装安全策略保持开启；没有忽略审计项。最终冻结锁文件安装通过。

DCloud 稳定版 `3.0.0-5020620260917001` 编译组合仍绑定 Vite 5.2.8 / Vue 3.4.21。没有强行用不同大版本覆盖 peer，也没有未经确认迁移框架。新 PDF.js 6.4.299 与 CloudBase Node SDK 3.18.7 已锁定。注册表元数据保存在证据目录。

## 剩余高风险（5 项公告）

| 依赖 | 风险 | 来源 |
| --- | --- | --- |
| lodash.set 4.3.2 | Prototype Pollution in lodash | [公告](https://github.com/advisories/GHSA-p6mc-m468-83gw) |
| vite 5.2.8 | launch-editor vulnerable to command injection via the crafted request on Windows | [公告](https://github.com/advisories/GHSA-c27g-q93r-2cwf) |
| vite 5.2.8 | vite: `server.fs.deny` bypass on Windows alternate paths | [公告](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) |
| braces 3.0.3 | braces vulnerable to stack-exhaustion denial of service through deeply nested patterns | [公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| @vue/server-renderer 3.4.21 | @vue/server-renderer: XSS via missing CR in attribute-name blacklist | [公告](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) |

`lodash.set` 在 CloudBase 数据库 SDK 运行依赖中，不能仅因三端构建通过而豁免。扫描建议的 4.3.3 在本轮注册表查询未发布；braces 建议 3.0.4、Babel 建议 7.29.1 同样未查到可安装版本。此结论按本轮查询时点记录，后续应重新核实。

Vite 与 Vue 风险主要位于 DCloud 移动编译链，当前 H5 为静态 SPA，不启用其 SSR；但包含开发服务器与构建输入的风险仍存在。当前演示使用自写回环静态服务，未将 Vite 开发服务器暴露公网。剩余中/低风险还包括 phin、esbuild、Babel、PostCSS selector parser；完整公告和依赖路径见 audit-after.json。

后续优先等待/验证 DCloud 官方兼容升级与 CloudBase 数据库 SDK 修复版；如果无兼容修复需补丁或框架更换，必须明确方案、回归范围和维护成本，不能以关闭检查解决。审计仅是已知漏洞数据库扫描，文件结构检查也不等于恶意代码扫描。
