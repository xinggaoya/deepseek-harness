---
kind: upgrade-guide
description: "models.dev 目录改为默认挂载并从本 fork 的代理读取，因此既访问不到该主机也访问不到 models.dev 的部署方继续使用已装的 pi-ai 目录。"
---

# models.dev 目录改为默认挂载并从本 fork 的代理读取

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-llm-models-dev` 原先是需要显式挂载的可选插件：没有任何随附组合挂载它，因此提供方路由从不从 models.dev 目录取用模型列表。现在 `dsh-base` bundle 挂载了它，并且该插件的默认端点改为本 fork 的代理 `https://models.moncn.cn/api.json`，不再是 models.dev 自己的 `https://models.dev/api.json`。

以目录记录的提供方 id 命名的提供方路由，现在从该目录服务该提供方的模型；模型页也会把目录记录的提供方与已装 pi-ai 目录提供的提供方并列列出。目录按计划抓取，并缓存在 harness home 中（`~/.dsh/cache/models-dev.json`），因此启动时先服务已有的提供方。

有两类部署方会观察到这一点。能访问该代理的部署方——或能访问 models.dev 并在插件的 `url` 配置中指定该端点的部署方——会看到第三方提供方列表。既访问不到该代理、也访问不到 models.dev 的部署方会保留上次抓到的目录；从未访问成功的部署方则照旧服务已装的 pi-ai 目录。

base bundle 的该行会读取 `DSH_MODELS_DEV_CATALOG_DISABLED`：取任意非空值即让该行保持未挂载。

## 迁移

1. 不允许访问目录主机、或必须保留已装 pi-ai 目录的部署方，让该行保持未挂载。可以在启动环境中设置环境变量：

   ```sh
   DSH_MODELS_DEV_CATALOG_DISABLED=1 dsh --profile headless "your task"
   ```

   也可以在 profile patch（`~/.dsh/profiles/<profile>/cordis.patch.yml`）中禁用该行：

   ```yaml
   - id: llm-models-dev
     disabled: true
   ```

2. 需要读取 models.dev 本身的部署方，在该行的配置中指定那个端点：

   ```yaml
   - id: llm-models-dev
     name: '@deepseek-ai/dsh-llm-models-dev'
     config:
       url: https://models.dev/api.json
   ```

3. 确认结果：模型页列出目录记录的提供方，其中以这些 id 命名的提供方路由服务该提供方的模型。该行未挂载时，模型页只列出已装的 pi-ai 目录。
