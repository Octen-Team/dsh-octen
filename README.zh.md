<p align="right"><a href="README.md">English</a> | <strong>简体中文</strong></p>

# dsh-octen

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 [Octen](https://octen.ai) 网页搜索和网页抓取。

插件把 Octen 注册为 harness 网页能力（`ctx.web`）的 provider，内置的 `web_search` 和 `web_fetch` 工具因此改走 Octen。不会多出新工具，模型看到的工具定义也和原来一样。

| 工具 | Octen 接口 | 模型拿到的内容 |
| --- | --- | --- |
| `web_search` | `POST /search` | 每条结果的标题、URL、与查询相关的摘录、发布时间 |
| `web_fetch` | `POST /extract` | 页面正文，转成干净的 Markdown，开头是页面标题 |

## 安装

需要 DeepSeek Harness 0.2.0-rc.2 或更新版本，以及一个 Octen API Key（在 [octen.ai](https://octen.ai) 获取）。

**在 Web 界面安装：** 打开 **插件**，点 **添加插件**，填入 `@octen.ai/dsh-octen`，点 **安装**。然后打开这个插件的页面，在 **Octen API Key** 里粘贴密钥，点 **保存**。

**在终端安装：** 用你实际在跑的 profile。桌面 App 的 profile 是 `desktop`，`dsh web` 用的是 `web`。

```sh
dsh plugin --profile desktop add @octen.ai/dsh-octen
```

如果终端提示 `command not found: dsh`，先打开桌面 App，在菜单栏选 **DeepSeek Harness → 管理 dsh 命令… → 安装**，再开一个新终端。如果 App 正开着，装完插件后重启一下 App。

然后在 Web 界面的插件页面保存密钥，或者在启动 DeepSeek Harness 的环境里导出：

```sh
export OCTEN_API_KEY=your-key
```

装好后，`web_search` 和 `web_fetch` 都会走 Octen。问 agent 一个需要最新信息的问题就能试。

## 选择哪些工具走 Octen

搜索和抓取是分开选的。如果只想用 Octen 搜索，抓取仍用自带的 HTTP 抓取，在 profile 的 `cordis.patch.yml`（例如 `~/.dsh/profiles/desktop/cordis.patch.yml`）里加：

```yaml
- id: web
  config:
    searchProvider: octen
    fetchProvider: http
```

想换回自带搜索，就写 `searchProvider: deepseek-official`。profile 自己的 patch 层在插件之后生效，所以以它为准。

## 配置

插件行的 id 是 `dsh-octen`。所有字段都可以不填；每次调用都会重新读取，改完不用重启。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `apiKeyEnv` | `OCTEN_API_KEY` | 读取密钥用的凭据引用：先查凭据存储（插件页面保存的就在这里），再查环境变量 |
| `apiKey` | 无 | 直接写明文密钥。建议用 `apiKeyEnv`，避免把密钥写进配置文件 |
| `baseURL` | 先取 `$OCTEN_API_URL`，再用 `https://api.octen.ai` | Octen API 地址。必须是 HTTPS，或者指向 `localhost` 的 HTTP。`OCTEN_API_URL` 只从进程环境或 `~/.dsh/.env` 读取，不读项目里的 `.env` |
| `extractTimeoutSeconds` | `25` | `web_fetch` 单个 URL 的提取超时，1–60 秒。要小于 `web_fetch` 工具的超时（默认 30 秒） |

示例：

```yaml
- id: dsh-octen
  config:
    apiKeyEnv: TEAM_OCTEN_KEY
    extractTimeoutSeconds: 20
```

## 行为说明

- **搜索。** 结果条数由 harness 决定（默认 8 条），插件把它作为 `count` 传给 Octen。没有 URL 的结果会被丢弃；缺标题、摘录或日期时直接留空，不会编造。
- **抓取。** 页面由 Octen 在服务端提取，harness 本地不下载、也不转换 HTML。Octen 不返回源站的状态码，所以提取成功一律报 HTTP 200。提取失败时，工具调用会带着 Octen 给的原因报错，例如 `Failed to resolve domain`。
- **错误。** 没有密钥时，请求发出之前就报 `WEB_PROVIDER_CREDENTIAL_MISSING`。密钥无效、余额不足、限流或服务端错误都报 `WEB_PROVIDER_ERROR`，并附上 Octen 的错误信息。取消报 `WEB_ABORTED`。
- **安全。** 密钥放在 `x-api-key` 请求头里；请求拒绝重定向，而且只发往 HTTPS 地址（或 `localhost` 上的 HTTP）。项目里的 `.env` 改不了接口地址，所以打开一个不可信的仓库也没法把你的密钥引到别处。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm test                         # 单元测试，跑在本地桩服务上
OCTEN_API_KEY=... pnpm test:live  # 真实调用 api.octen.ai
pnpm run build                    # 产出 lib/index.js（host 侧）和 lib/client.js（设置页）
```

想试本地构建，可以打包后把 tarball 装进 profile：

```sh
npm pack
dsh plugin --profile desktop add "$PWD/octen.ai-dsh-octen-0.1.0.tgz"
```

代码分两部分。`src/index.ts` 是注册 provider 的 host 插件。`src/client/` 是插件页面上的设置区块，打包成 `window.__ModuleLoader__` 工厂，由 harness 的 Web 外壳加载。

## 许可证

MIT
