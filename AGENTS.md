# 开发者笔记

给接手这个仓库的人（或 agent）看的东西。用户文档在 `README.md`。

## 结构

```
src/index.ts        Host apply：HTTP 路由 + WebSocket + 系统提示 + 局域网代理 + Cloudflare 部署器
src/config.ts       Config（schemastery）与 ResolvedConfig
src/invariant.ts    包名、面板 key、路由前缀、协议名、常量
src/engine/         纯规则：牌、牌型、下注、边池、单手状态机（无 Node 依赖）
src/room/           房间状态机（RoomManager）、代号/邀请/会话
src/net/            HTTP 路由、WS、CORS/Origin 校验、邀请页、网页牌桌、局域网代理、Cloudflare 授权部署
src/persist/        JSONL 审计日志（Node）与 noop store（Worker 也用它）
src/client/         React 面板（factory-CJS 产物）：大厅/牌桌/行动条/结算/邀请面板
worker/index.ts     Cloudflare Worker + RoomsDurableObject（复用 src/engine + src/room）
tests/              引擎、房间、路由、局域网代理、样式一致性、客户端渲染
```

## 两条后端链路

同一套协议和客户端，两种承载：

1. **本机**：`RoomManager` 跑在 dsh 进程里，再由 `src/net/lan-proxy.ts` 起一个只转发
   `/holdem/*`（HTTP + WS）的 `0.0.0.0` 小代理，邀请链接用它的端口 + 局域网 IP。
2. **Cloudflare**：`worker/index.ts` 把同一个 `RoomManager` 放进 Durable Object，Worker 只做转发；
   客户端通过 `setApiBase(workerOrigin)` 把请求和 WS 都指向它。
   房间的对外地址取请求的 origin，所以邀请链接自然是 worker 域名。

新增后端（ngrok、Tailscale、自建 VPS…）只需要在 `src/client/backends.ts` 里加一条 `HostingOption`，
并让服务端提供一个同协议的 `RoomManager` 宿主。

## 认证与安全

- 座位凭证：`hdm_seat_<roomId>` cookie **或** `x-holdem-seat` 请求头（客户端优先用头 + sessionStorage，
  不依赖浏览器是否保留 cookie）。每个标签页各自持有 token。
- 变更请求必须带 `x-requested-with`（跨源页面无法伪造，等于 CSRF token）。
- Origin 只接受回环地址与私有网段（RFC1918）；CORS 也只对这两类 origin 放开。
- 建房、Cloudflare 授权/部署这类"本机特权"操作还额外要求回环 Host + 回环来源。
- 实时通道**不协商子协议**：Worker 的 Durable Object 没法在 101 响应里回
  `Sec-WebSocket-Protocol`，浏览器只要请求了子协议，握手就以 1006 失败。`ws.ts` 仍然兼容老客户端。
- 在线状态 = 打开的实时通道 **或** `PRESENCE_TTL_MS`（20s）内有过 HTTP 请求
  （`markConnected` 只管 socket；`view()`/`command()` 都会 `touch`）。所以轮询时不会显示成离线。

## 云授权/部署

`src/net/cloudflare.ts` 直接驱动官方 `wrangler` CLI（作为 dependencies 安装，不要求全局）：

- 授权：`wrangler login`（wrangler 自己开浏览器走 OAuth，插件只把 URL 抓出来给界面复制；
  等待中可 `cancel` 杀掉子进程）。
- 部署：`wrangler deploy --config <packageRoot>/wrangler.toml`（`main` 指向预构建的 `lib/worker.js`），
  从输出里抓 `*.workers.dev` 并记到 `~/.dsh/holdem/cloudflare.json`。
- CLI 调用方式按顺序探活：`HOLDEM_WRANGLER` → PATH 的 `node` + 依赖里的 wrangler →
  Electron 的 `ELECTRON_RUN_AS_NODE=1` → 插件 `.bin/wrangler` → PATH 的 `wrangler`。

## 开发命令

```sh
pnpm install
pnpm typecheck        # 主工程
pnpm worker:typecheck # Worker（@cloudflare/workers-types）
pnpm test
pnpm build            # lib/index.js + lib/client.js + lib/worker.js
pnpm verify           # typecheck + build + test
pnpm worker:dev       # 本地 wrangler dev（http://127.0.0.1:8787）
pnpm worker:deploy    # 构建并部署 Worker
```

## 约定

- 规则只写在 `src/engine`；权威状态在 Host（或 Durable Object），客户端不裁定任何结果。
- `src/engine`、`src/room`、`src/net/{play-page,join-page,lan-proxy,cloudflare 的部分}` 不可以用 Node API
  （要能进 Workers）；Node 专属的东西放 `src/net/{routes,ws,cloudflare,network}.ts` 或 `src/persist/store.ts`。
- 改客户端（`src/client`）后要 `pnpm build` 再刷新页面；改 Host 需要重挂插件或重启 `dsh`。
- 样式改动请保持 `tests/client/styles.spec.ts` 通过（禁止重复类名、`css.*` 必须有定义）。
