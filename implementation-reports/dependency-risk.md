# 依赖风险记录（2026-10-19）

本轮 `pnpm audit --json` 退出 1：0 critical、18 high、25 moderate、8 low，共 51 条依赖告警。完整路径与范围保留在 `evidence/dependency-audit.json`。这是依赖审计结果，不是渗透测试；未逐条证明本项目的具体攻击可达性。

主要路径来自 apps/mobile 的 DCloud 配套依赖。当前官方配套 Vite 5.2.8 与 Vue 3.4.21 参与 Uni 编译链；简单全局强制覆盖可能破坏兼容性，本轮没有做未经验证的覆盖、删除告警或降低检查。Next 门户和 PC 后台独立锁定各自依赖，不强制共享旧版 Vite。

本轮已将 H5 日常查看切换为构建产物静态服务，仅监听回环地址，并验证根目录与 Origin 限制。这限制本地预览暴露面，不是依赖修复。Mock 不支持生产环境，也不提供真实身份。当前工程不可据此通过对外部署审查。

后续整改输入：选择支持修复版本的成套 Uni 工具链，逐项检查传递依赖的修复／升级兼容性；固定锁文件后再次审计，并重新执行类型、API、浏览器、H5 与小程序构建验证。残留告警需要逐条记录依赖用途、实际可达性和处理决定；没有证据时不得直接标为“无影响”。方案超出本轮已确认的依赖组合，实施前另列计划确认。

下表由本机 audit 原始结果提取；修复范围为该条 advisory 报告，满足某一条范围不意味着消除该模块全部告警。

| 模块 | 等级 | 当前版本 | 该告警修复范围 | 公告 |
| --- | --- | --- | --- | --- |
| jpeg-js | high | 0.3.7 | >=0.4.4 | [公告](https://github.com/advisories/GHSA-xvf7-4v9q-58w6) |
| jpeg-js | moderate | 0.3.7 | >=0.4.0 | [公告](https://github.com/advisories/GHSA-w7q9-p3jq-fmhm) |
| phin | moderate | 2.9.3 | >=3.7.1 | [公告](https://github.com/advisories/GHSA-x565-32qp-m3vf) |
| vite | moderate | 5.2.8 | >=5.2.14 | [公告](https://github.com/advisories/GHSA-9cwx-2883-4wfx) |
| vite | moderate | 5.2.8 | >=5.2.14 | [公告](https://github.com/advisories/GHSA-64vr-g452-qvp3) |
| esbuild | moderate | 0.20.2 | >=0.24.3 | [公告](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |
| vite | moderate | 5.2.8 | >=5.4.12 | [公告](https://github.com/advisories/GHSA-vg6x-rcgg-rjx6) |
| vite | moderate | 5.2.8 | >=5.4.15 | [公告](https://github.com/advisories/GHSA-x574-m823-4x7w) |
| vite | moderate | 5.2.8 | >=5.4.18 | [公告](https://github.com/advisories/GHSA-356w-63v5-8wf4) |
| cookie | low | 0.6.0 | >=0.7.0 | [公告](https://github.com/advisories/GHSA-pxg6-pf52-xh8x) |
| vite | moderate | 5.2.8 | >=5.4.19 | [公告](https://github.com/advisories/GHSA-859w-5945-r5v3) |
| vite | moderate | 5.2.8 | >=5.4.17 | [公告](https://github.com/advisories/GHSA-xcj6-pq6g-qj4x) |
| path-to-regexp | high | 0.1.10 | >=0.1.12 | [公告](https://github.com/advisories/GHSA-rhx6-c78j-4q9w) |
| @intlify/core-base | moderate | 9.1.9 | >=9.14.5 | [公告](https://github.com/advisories/GHSA-x8qp-wqqm-57ph) |
| vite | low | 5.2.8 | >=5.4.20 | [公告](https://github.com/advisories/GHSA-g4jq-h2w9-997c) |
| vite | low | 5.2.8 | >=5.4.20 | [公告](https://github.com/advisories/GHSA-jqfw-vq24-v9c3) |
| vite | moderate | 5.2.8 | >=5.4.21 | [公告](https://github.com/advisories/GHSA-93m4-6634-74q7) |
| send | low | 0.18.0 | >=0.19.0 | [公告](https://github.com/advisories/GHSA-m6fv-jmcg-4jfg) |
| vite | moderate | 5.2.8 | >=5.4.16 | [公告](https://github.com/advisories/GHSA-4r4m-qw57-chr8) |
| qs | low | 6.11.0, 6.13.0 | >=6.14.2 | [公告](https://github.com/advisories/GHSA-w7fw-mjwx-w883) |
| qs | moderate | 6.11.0, 6.13.0 | >=6.14.1 | [公告](https://github.com/advisories/GHSA-6rw7-vpxm-498p) |
| path-to-regexp | high | 0.1.10 | >=0.1.13 | [公告](https://github.com/advisories/GHSA-37ch-88jc-xwx2) |
| vite | moderate | 5.2.8 | >=6.4.2 | [公告](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) |
| postcss | moderate | 8.5.6 | >=8.5.10 | [公告](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) |
| ws | moderate | 8.18.0 | >=8.20.1 | [公告](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) |
| qs | moderate | 6.13.0 | >=6.15.2 | [公告](https://github.com/advisories/GHSA-q8mj-m7cp-5q26) |
| vite | high | 5.2.8 | >=5.4.9 | [公告](https://github.com/advisories/GHSA-c27g-q93r-2cwf) |
| vite | moderate | 5.2.8 | >=6.4.3 | [公告](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) |
| ws | high | 8.18.0 | >=8.21.0 | [公告](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) |
| vite | high | 5.2.8 | >=6.4.3 | [公告](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) |
| @babel/core | low | 7.25.2 | >=7.29.1 | [公告](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) |
| adm-zip | high | 0.5.16 | >=0.6.0 | [公告](https://github.com/advisories/GHSA-xcpc-8h2w-3j85) |
| body-parser | low | 1.20.3 | >=1.20.6 | [公告](https://github.com/advisories/GHSA-v422-hmwv-36x6) |
| postcss | high | 8.5.6 | >=8.5.12 | [公告](https://github.com/advisories/GHSA-6g55-p6wh-862q) |
| postcss | moderate | 8.5.6 | >=8.5.23 | [公告](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) |
| postcss | high | 8.5.6 | >=8.5.18 | [公告](https://github.com/advisories/GHSA-r28c-9q8g-f849) |
| @intlify/core-base | high | 9.1.9 | >=9.1.11 | [公告](https://github.com/advisories/GHSA-p2ph-7g93-hw3m) |
| @intlify/message-resolver | high | 9.1.9 | >=9.1.11 | [公告](https://github.com/advisories/GHSA-p2ph-7g93-hw3m) |
| postcss-selector-parser | low | 6.1.2 | >=6.1.3 | [公告](https://github.com/advisories/GHSA-w9m9-85wc-3x92) |
| qs | moderate | 6.11.0, 6.13.0 | >=6.16.0 | [公告](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) |
| adm-zip | moderate | 0.5.16 | >=0.6.1 | [公告](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9) |
| adm-zip | high | 0.5.16 | >=0.6.1 | [公告](https://github.com/advisories/GHSA-7q85-xj36-vmfc) |
| adm-zip | high | 0.5.16 | >=0.6.1 | [公告](https://github.com/advisories/GHSA-rcw4-f5rp-g42v) |
| adm-zip | high | 0.5.16 | >=0.6.1 | [公告](https://github.com/advisories/GHSA-j5f4-cc29-5x44) |
| adm-zip | moderate | 0.5.16 | >=0.6.1 | [公告](https://github.com/advisories/GHSA-p634-w6r4-rjp2) |
| adm-zip | moderate | 0.5.16 | >=0.6.1 | [公告](https://github.com/advisories/GHSA-c6fg-446q-cg94) |
| adm-zip | high | 0.5.16 | >=0.6.1 | [公告](https://github.com/advisories/GHSA-8238-w5pm-2374) |
| braces | high | 3.0.3 | >=3.0.4 | [公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| source-map-js | high | 1.2.1 | >=1.2.2 | [公告](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| postcss-selector-parser | moderate | 6.1.2 | >=7.1.6 | [公告](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| @vue/server-renderer | high | 3.4.21 | >=3.5.42 | [公告](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) |
