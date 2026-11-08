---
kind: upgrade-guide
description: "The models.dev catalog is mounted by default and read from the fork's proxy, so a deployment that reaches neither that host nor models.dev keeps the installed pi-ai catalog."
---

# The models.dev catalog is mounted by default and read from the fork's proxy

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-llm-models-dev` was an opt-in plugin: no shipped composition mounted it, so a provider route never drew its model list from the models.dev catalog. The `dsh-base` bundle now mounts it, and the plugin's default endpoint is the fork's proxy `https://models.moncn.cn/api.json` instead of models.dev's own `https://models.dev/api.json`.

A provider route named after a provider id the catalog records now serves that provider's models from the catalog, and the Models page lists the providers the catalog records beside the ones the installed pi-ai catalog ships. The catalog is fetched on a schedule and kept in the harness home's cache (`~/.dsh/cache/models-dev.json`), so a start serves the providers it already had.

Two deployments observe this. One that reaches the proxy — or reaches models.dev and names that endpoint in the plugin's `url` configuration — sees the third-party provider list. One that reaches neither keeps the catalog it last fetched, and a deployment that never reached it serves the installed pi-ai catalog unchanged, as before.

The base bundle's row reads `DSH_MODELS_DEV_CATALOG_DISABLED`: any non-empty value keeps the row unmounted.

## Migration

1. A deployment that must not reach the catalog host, or that must keep the installed pi-ai catalog, keeps the row unmounted. Either set the environment variable in the launch environment:

   ```sh
   DSH_MODELS_DEV_CATALOG_DISABLED=1 dsh --profile headless "your task"
   ```

   or disable the row in the profile patch (`~/.dsh/profiles/<profile>/cordis.patch.yml`):

   ```yaml
   - id: llm-models-dev
     disabled: true
   ```

2. A deployment that reads models.dev itself names that endpoint in the row's configuration:

   ```yaml
   - id: llm-models-dev
     name: '@deepseek-ai/dsh-llm-models-dev'
     config:
       url: https://models.dev/api.json
   ```

3. Confirm the outcome: the Models page lists the providers the catalog records, and a provider route named after one of them serves that provider's models. With the row unmounted, the Models page lists the installed pi-ai catalog only.
