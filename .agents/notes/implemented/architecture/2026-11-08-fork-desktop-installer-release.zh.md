# Agent Note：fork 自有的 Windows 安装包发布

Status: implemented

[English](2026-11-08-fork-windows-installer-release.md) | 中文

## Problem

本仓库继承了上游项目的三十二个 GitHub 工作流。其中二十个服务于上游的发布体系：dsh 的 npm 发布序列及其发布器、vendor 与 Python 与 native 的发布序列、桌面打包与发布这一对，以及 issue 与 PR 的治理机器人。它们每一个都依赖 fork 没有的基础设施——专用的自托管 Windows 打包机 `dsh-win-package-trial`、`packaging/secrets/windows-signing.env` 背后的 SafeNet EV 令牌、`packaging/presets/` 下的机器预设，以及腾讯云 COS 的发布凭据。fork 要为自己产出一个安装包并不需要其中任何一项，但这二十个工作流照样占用本仓库的 Actions 页面，等着 fork 永远不会提供的配置。

fork 也没有只靠 GitHub 拿到 Windows 安装包的途径。上游的打包工作流只能手动触发，拒绝在没有签名硬件的情况下构建，而且面向的是上游的发布渠道与更新源。

## Decision

本 fork 运行十二个通用工作流，加上一个自有工作流。二十个上游发布与治理工作流已经移除，`.github/issue-management/` 目录与记录已删 Cloudflare 预览流水线的 `.github/preview-sizing/` 目录一并移除。移除的发布序列是 `release.yml`、`release-publish.yml`、`release-vendor.yml`、`release-vendor-publish.yml`、`python-release.yml`、`publish-ssh-helper.yml`、`node-addon-system-release.yml`、`desktop-publish.yml`。移除的桌面打包是 `windows-package.yml`、`macos-package.yml`、`macos-intel-package.yml`、`cua-helper-package.yml`。移除的治理机器人是 `issue-lifecycle.yml`、`issue-policy.yml`、`pr-check-after-approve.yml`、`pr-check-on-base-branch.yml`、`pr-check-on-head-branch.yml`、`weighted-approval.yml`、`weighted-approval-review-event.yml`、`build-preview-cloudflare.yml`。

保留下来的是质量门与文档站：`ci.yml`、`ci-master.yml`、`ci-python.yml`、`ci-windows.yml`、`e2e.yml`、`pi-ai-provider-e2e.yml`、`sandbox.yml`、`node-addon-system.yml`、`expected-filenames.yml`、`docs-pages.yml`，以及被保留的 CI 所复用的两个可复用构建工作流。`ci-master.yml` 和 `ci-python.yml` 调用 `build-exe-for-python-sdk.yml`，`ci-master.yml` 调用 `build-exe-for-ssh-helper.yml`，两者都保留。`.github/review-ownership/` 目录保留，因为 `ci-python.yml` 会运行它的 Python 测试。

`.github/workflows/build-windows-installer.yml` 构建本 fork 自有的未签名 Windows x64 安装包，并将其发布为 GitHub Release。它在 `v*` tag 推送时运行，也支持 `workflow_dispatch`；tag 即发布名称，其后缀就是构建版本，由 `apps/desktop/scripts/prepare-windows-ci.mjs` 在任何构建动作之前对所检出代码树的产品版本完成校验。不扩展该版本的 tag 会在构建之前失败，而不会产出 Release。

作业跑在 GitHub 托管的 `windows-2025` 镜像上，该镜像自带包含 `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` 的 Visual Studio Enterprise 2022、Windows SDK 10.0.26100、VSWhere 3.1.7、Python 3.12.10、7zip 与 Node 24。它满足仓库的 `desktop-toolchain-preflight.ts` 探测，既不必安装工具链，也不必自建 runner，因此未签名模式不需要签名证书，也不需要发布凭据。作业在 `DSH_PACKAGING_CONFIG_DIR` 下写出自己的未签名预设，把强制更新 origin 指向一个保留的不可解析主机，于是策略查询只记录 `unavailable`，不阻塞应用。作业把 `DSH_DESKTOP_PACKAGE_CACHE_DIR` 与 `ELECTRON_BUILDER_CACHE` 指向缓存目录，使 pnpm store、primary runtime 归档与 electron-builder 工具链在多次运行之间保留。

`apps/desktop/scripts/prepare-package-set.ts` 通过 `scripts/release/tarball.ts` 读取已打包的清单，而不再本地重复实现一次读取。Windows 上的 GNU tar 会把绝对路径里的冒号读成远程主机分隔符，共享的读取器已经在归档旁边用相对名运行 tar；本地那份重复漏掉了这个工作目录，是桌面打包路径上最后一处绝对路径 tar 调用。

断言已删工作流的测试随之移除。`scripts/windows-package-workflow.spec.ts`、`scripts/macos-package-workflow.spec.ts`、`scripts/desktop-publish-workflow.spec.ts`、`scripts/preview-workflow.spec.ts`、`scripts/desktop-package-forms.spec.ts` 与 `scripts/tests/ci-release-selfhosted.spec.ts` 一并移除，`scripts/desktop-archive-workflow-test.ts` 也移除——它只是那几个 spec 使用的共享归档断言助手。五个保留下来的测试文件继续覆盖留下来的工作流：`scripts/ci-workflow.spec.ts` 去掉了发布、发布器、生命周期、加权审批与策略检查各段，只读剩下的工作流；`scripts/client-build-environment.client.spec.ts` 与 `scripts/tests/ci-master-platforms.spec.ts` 从列表里去掉已删的工作流名；`scripts/cua-helper/payload.spec.ts` 与 `apps/desktop/tests/desktop-publish-local-preflight.spec.ts` 去掉了读取已删工作流文件的断言。

`.github/AGENTS.md` 描述 fork 的工作流集合与 tag 路径。`.github/fork-sync.md` 及其中文版让上游同步路径以打 tag 收尾，而不是以本地构建收尾。上游笔记与文档里指向已删文件的交叉链接改为纯文本引用，于是 fork 仍能读懂上游决策，却不宣称那些机制依然存在。

## Verification

`apps/desktop/scripts/prepare-package-set.ts` 在 GNU tar 主机上针对本检出树的已打包 tarball 运行并生成了 package set；同样的输入在改动前以 `tar (child): Cannot connect to C: resolve failed` 失败。

`apps/desktop/scripts/prepare-windows-ci.mjs` 用该工作流自己的预设与环境运行，把版本 `0.2.2-rc.1.20261108.1` 解析进步骤输出。

typecheck 门禁通过，lint 门禁没有报错，markdown 链接门禁在 2448 个文件上通过，双语配对门禁在 1219 对上通过。与工作流相关的测试文件全部通过：`scripts/ci-workflow.spec.ts` 跑 46 项测试，desktop、cua-helper 与 CI 平台相关 spec 一并通过。文档构建与文档站点检查在本机上失败，原因早于本次改动：esbuild 0.21.5 不接受 `es2024` 目标，且在 Windows 临时目录下创建符号链接需要该账号不具备的权限。

## Alternatives considered

**保留上游发布工作流以备后用。** 否决，因为它们在 fork 永远不会提供的配置上失败，而一个总是失败的工作流只会教会读者忽略 Actions 页面。

**把 fork 拥有者自己的机器作为自托管 runner 来构建。** 否决，因为 runner 必须保持在线且配置完毕，那等于把工作流本该消除的依赖又搬了回来。托管的 Windows 镜像已经带着打包所需的编译器和 SDK。

**像上游那样把安装包发布到腾讯云 COS。** 否决，因为它需要 bucket 凭据和 fork 不拥有的域名，而放在 fork 自己仓库里的 GitHub Release 在不需要二者的前提下给出同样的下载。

**自动把上游合进 fork 并从合并结果构建。** 否决，因为合并冲突需要人来处理，而一个在打包前悄悄合并上游的构建会发布一棵没人审阅过的代码树。

**改为在每次推送 `master` 时触发构建，而不是用 tag。** 否决，因为那样每次运行都得另行编造发布标识，而 tag 已经给出了发布名称，也不会与先前的发布重名。

**给安装包签名。** 否决，因为签名需要 EV 令牌及其签名机，那正是本次移除的上游基础设施。

**用 `TAR_OPTIONS=--force-local` 绕过 Windows 上的 tar 缺陷。** 否决，因为该标志是 GNU tar 的扩展，其他 tar 实现会拒绝它，而共享的读取器已经带上了正确处理。

## Consequences

fork 的安装包路径是：一个版本 tag、一个托管 runner、一个 GitHub Release。上游合并仍是人工步骤：按 `.github/fork-sync.md` 描述的方式通过拉取请求同步上游，随后打下的 tag 产出安装包。

运行成本是 Actions 分钟数。一次完整构建要编译每个 workspace 包、下载 primary runtime，并把约一 GB 压缩成安装包，因此一个 tag 消耗二十到四十分钟 Windows runner 时间，首次运行最慢，因为它要填充缓存。

fork 从上游继承了分支保护设置。指向已不存在工作流的必需状态检查永远无法上报，会让 PR 永远无法合并，因此仓库设置必须去掉被删工作流对应的检查名。工作树改不了这些设置。

`windows-2025` 标签跟随滚动镜像。某个镜像若去掉 Visual Studio C++ 组件，打包预检就会失败，直到工作流自己安装工具链。

发布的安装包没有签名，Windows 首次启动时会显示未知发布者警告。fork 没有签名身份，这是移除上游签名基础设施所接受的代价。

构建用的强制更新 origin 不可解析，因此打好的应用不会被强制更新，也不会因该查询阻塞启动。这个安装包因此收不到上游的强制安全更新，fork 自己的更新路径不在本次范围内。
