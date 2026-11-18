<p align="right"><strong>English</strong> | <a href="README.zh.md">简体中文</a></p>

# dsh-octen

[Octen](https://octen.ai) web search and page fetch for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

The plugin registers Octen as a provider on the harness web seam (`ctx.web`), so the built-in `web_search` and `web_fetch` tools run through Octen. You do not get new tools to learn, and the model sees the same tool schema as before.

| Tool | Octen endpoint | What the model gets |
| --- | --- | --- |
| `web_search` | `POST /search` | Title, URL, a query-relevant highlight, and the publication time for each result |
| `web_fetch` | `POST /extract` | The page's main content as clean Markdown, headed by its title |

## Install

You need:

- DeepSeek Harness 0.2.x: 0.2.0-rc.2 or later, below 0.3.0.
- Node.js 22.19 or later. DeepSeek Harness 0.2.2 pre-releases require Node.js 24.9 or later.
- `pnpm` on your `PATH` when you use the `dsh` command from npm or `npx`, because `dsh plugin` runs `pnpm add`. The `dsh` command installed by the desktop app brings its own pnpm.
- An Octen API key from the [Octen API Platform](https://octen.ai/platform/api-keys).

**From the web UI:** open **Plugins**, click **Add plugin**, enter `@octen.ai/dsh-octen`, and click **Install**. Then open the plugin's page, paste your key into **Octen API key**, and click **Save**.

**From a terminal:** plugins are installed per profile. Use the profile you run; `dsh web` uses `web`.

```sh
dsh plugin --profile web add @octen.ai/dsh-octen
```

Without the `dsh` command on your `PATH`, run the same command through npm: `npx @deepseek-ai/dsh plugin --profile web add @octen.ai/dsh-octen`.

**For the desktop app:** its `desktop` profile can only be changed by the `dsh` command the desktop app installs (**DeepSeek Harness → Manage dsh Command… → Install**). Any other `dsh`, including `npx`, stops with `profile "desktop" is managed exclusively by the Electron application`.

1. Open the desktop app once so it sets up its profile, then quit it completely. Closing the window is not enough.
2. Run `dsh plugin --profile desktop add @octen.ai/dsh-octen` in a new terminal.
3. Open the desktop app again to load the plugin.

Then save the key on the plugin's page in the web UI, add `OCTEN_API_KEY=your-key` to `~/.dsh/.env`, or export it in the environment that launches DeepSeek Harness:

```sh
export OCTEN_API_KEY=your-key
```

Installing the plugin points both `web_search` and `web_fetch` at Octen. Ask the agent something current to try it.

## Choose which tools use Octen

Search and fetch are selected separately. To keep Octen search but go back to the shipped HTTP fetch, add this to your profile's `cordis.patch.yml` (for example `~/.dsh/profiles/web/cordis.patch.yml`). The file must stay a YAML list: if it only holds the empty list `[]`, replace that line with your entries, otherwise DeepSeek Harness fails to start with `failed to parse overlay`.

```yaml
- id: web
  config:
    searchProvider: octen
    fetchProvider: http
```

Use `searchProvider: deepseek-official` to go back to the shipped search. Your profile's patch layer applies after the plugin's own, so it wins.

## Configuration

The plugin's row id is `dsh-octen`. All fields are optional.

| Field | Default | Meaning |
| --- | --- | --- |
| `apiKeyEnv` | `OCTEN_API_KEY` | Credential reference the key is read from: the credentials store (what the Plugins page writes), then the environment |
| `apiKey` | none | Literal key. Prefer `apiKeyEnv`, so no secret goes into a config file |
| `baseURL` | `$OCTEN_API_URL`, then `https://api.octen.ai` | Octen API base. Must be HTTPS, or HTTP to `localhost`. `OCTEN_API_URL` is read from the process environment or `~/.dsh/.env`, never from a project's `.env` |
| `extractTimeoutSeconds` | `25` | Per-URL extraction timeout for `web_fetch`, 1–60. Keep it below the `web_fetch` tool budget (30 s by default) |

For example, to read the key from a different variable and shorten the fetch timeout, add this to your profile's `cordis.patch.yml`:

```yaml
- id: dsh-octen
  config:
    apiKeyEnv: TEAM_OCTEN_KEY
    extractTimeoutSeconds: 20
```

## Behavior

- **Search.** The harness sets the result count, and the plugin passes it to Octen as `count`. Results without a URL are dropped; a missing title, highlight, or date is left out instead of being made up.
- **Fetch.** Octen extracts the page server-side, so the harness does not download or convert HTML itself. A successful extraction reports HTTP status 200, because Octen does not return the origin's status code. If Octen cannot extract the page, the tool call fails with Octen's reason, for example `Failed to resolve domain`.
- **Errors.** A missing key fails with `WEB_PROVIDER_CREDENTIAL_MISSING` before any request is sent. A rejected key, an exhausted balance, a rate limit, or a server error fails with `WEB_PROVIDER_ERROR` and Octen's message. Cancellation reports `WEB_ABORTED`.
- **Security.** Requests carry your key in the `x-api-key` header, refuse redirects, and go only to an HTTPS base (or HTTP on `localhost`). A project's `.env` cannot change the endpoint, so opening an untrusted repository cannot redirect your key.

## Uninstall

If you added `id: web` or `id: dsh-octen` entries to the profile's `cordis.patch.yml`, delete them first, and put `[]` back if no entries are left. Entries left behind keep search pointed at a provider that no longer exists. Then remove the plugin:

```sh
dsh plugin --profile web remove @octen.ai/dsh-octen
```

The profile then composes as it did before the plugin was installed. Run `dsh web --dump-config` to check. For the desktop app, quit it completely, run `dsh plugin --profile desktop remove @octen.ai/dsh-octen` with the `dsh` command it installed, and open it again.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test                         # unit tests against a local stub server
OCTEN_API_KEY=... pnpm test:live  # real calls to api.octen.ai
pnpm run build                    # lib/index.js (host) and lib/client.js (settings page)
```

To try a local build, pack it and add the tarball to a profile:

```sh
npm pack
dsh plugin --profile web add "$PWD/octen.ai-dsh-octen-0.1.0.tgz"
```

The package has two halves. `src/index.ts` is the host plugin that registers the providers. `src/client/` is the settings section on the plugin's Plugins page, bundled as a `window.__ModuleLoader__` factory that the harness web shell loads.

## License

MIT
