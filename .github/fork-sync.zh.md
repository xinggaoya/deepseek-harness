# Fork 同步指南

[English](fork-sync.md) | 中文

本仓库是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（上游）的下游 fork。fork 在上游 `master` 之上携带少量下游特性；本页记录如何把上游的改动合并回来而不丢失这些特性。

## 远程

两个远程已经配置好：

| 远程 | 仓库 | 角色 |
|---|---|---|
| `origin` | `https://github.com/xinggaoya/deepseek-harness.git` | 本 fork——推送到这里 |
| `upstream` | `https://github.com/deepseek-ai/deepseek-harness` | 上游——从这里拉取，绝不推送 |

```bash
git remote -v          # 确认两条记录
git fetch upstream     # 把上游的引用拉进本地仓库
```

## 例行同步

1. 拉取上游并查看变化：

   ```bash
   git fetch upstream
   git log --oneline master..upstream/master | head -50
   ```

2. 从 fork 的 `master` 开一个同步分支：

   ```bash
   git switch master
   git pull --ff-only origin master
   git switch -c sync/upstream-$(date +%Y%m%d)
   ```

3. 把上游合并进来。用合并而非变基，可以保留 fork 的历史，之后每次同步只多一个合并提交：

   ```bash
   git merge upstream/master
   ```

4. 解决冲突（见下面的高发点）。生成文件一律重新生成，不手工合并。

5. 跑门禁阶梯（见下）。

6. 推送分支并向本 fork 的 `master` 开一个拉取请求：

   ```bash
   git push origin sync/upstream-$(date +%Y%m%d)
   gh pr create --base master --head sync/upstream-$(date +%Y%m%d) \
     --title "sync: merge upstream/master" --body "Merged upstream/master into the fork."
   ```

7. 门禁全绿后合并该拉取请求，并删除分支。

## 冲突高发点

下面这些路径几乎每次合并上游都会变动。请重新生成，而不是手工解决：

| 路径 | 重新生成命令 |
|---|---|
| `docs/config-catalog.md`、`docs/config-catalog.zh.md` | `pnpm run gen-config-catalog` |
| `docs/capability-seams.md`、`docs/capability-seams.zh.md` 及其余图文档 | `pnpm run gen-doc-graphs` |
| `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` | `pnpm run gen-client-catalog` |
| `packages/extensions/tool-cordis/src/api-catalog.ts` 与 cordis API 页面 | `pnpm run gen-cordis-catalog` |
| `packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md` | `pnpm run gen-plugin-packages` |
| `tsconfig.base.json`（包别名） | `pnpm run gen-tsconfig-paths` |

冲突时需要手工处理：

- `packages/bundle/base/cordis.patch.yml` 与 `packages/bundle/web-app/cordis.patch.yml`——base bundle 的插件行与 Web 应用的浏览器名册。保留 fork 新增的行，同时接受上游新增的行。
- `packages/bundle/web-app/presets/*.patch.yml`——随附的 Agent 预设。fork 从 `standard`、`cordis`、`ptc` 三个预设里删掉了 `persona` 行（见下），合并时保留这一删除。
- `tsconfig.host.json` 与 `tsconfig.client.json`——工程引用。两侧新增的条目都要保留。

任何重新生成之后，都要重新记录双语配对：

```bash
pnpm run verify-translation-pairing --write <改动的文档>
```

## 本 fork 自己的改动

每次同步后都要复查下面这些内容——它们是最容易被上游合并悄悄还原的部分：

- **三个设置页**——`packages/client/ui-settings-skills`（只读的技能目录）、`packages/client/ui-settings-prompt`（部署人设）、`packages/client/ui-settings-mcp`（本部署连接的 MCP 服务器）。三者各注册一个 `settings.section` 行，因此设置导航顺序为 `general`、`models`、`plugins`、`agent-presets`、`skills`、`mcp`、`prompt`。
- **部署人设可编辑**——`packages/core/system-prompt` 把 `personaPrefix`、`personaSuffix`、`includeHarnessIdentity`、`personaComplete` 暴露为易失字段，并在 Loader 提交新值时重新注册提示词段落。
- **随附预设不再携带 persona 行**——`standard`、`cordis`、`ptc` 继承部署人设，`minimal` 保留自己的。上游若改动这些预设文件，需要同样处理。
- **MCP 服务器命名空间**——`packages/mcp/mcp-servers` 拥有 `mcp-servers` 设置命名空间，并让运行中的 `mcp-client` 实例与之对齐。
- **技能目录支持按预设查询**——`skills.list` 既接受会话 id，也接受预设 id。

## 门禁阶梯

合并同步分支前依次运行；每一项覆盖一个面：

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:gui
DSH_SNAPSHOT=replay pnpm run test:web
pnpm run doc-sync
pnpm run hygiene
```

`DSH_SNAPSHOT=replay` 重放录制的浏览器场景；只有在确认输出变化是有意为之之后才用 `DSH_SNAPSHOT=refresh`，因为它会改写录制的期望值。

## 发布下游改动

下游工作遵循上游的约定，因此可以干净地合回去：

1. 从 fork 的 `master` 开分支（`git switch -c feat/<topic>`）。
2. 改动各自成提交，沿用上游的提交风格（`feat(scope): …`）。
3. 对外可见的变更写入 `docs/upgrade-guide/v<version>/<item>/guide.md` 下的升级指南，持久决策写入 `.agents/notes/implemented/` 下的 Agent Note。
4. 跑门禁阶梯，推送分支，向本 fork 的 `master` 开一个拉取请求。
