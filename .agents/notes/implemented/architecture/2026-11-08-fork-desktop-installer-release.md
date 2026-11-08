# Agent Note: Fork-owned Windows installer releases

Status: implemented

English | [中文](2026-11-08-fork-windows-installer-release.zh.md)

## Problem

This repository inherited the upstream project's thirty-two GitHub workflows. Twenty of them serve the upstream publication system: the dsh npm release sequence and its publisher, the vendor and Python and native release sequences, the Desktop packaging and publication pair, and the issue and pull-request governance robots. Every one of them depends on infrastructure this fork does not have — the dedicated self-hosted Windows packaging runner `dsh-win-package-trial`, the SafeNet EV token behind `packaging/secrets/windows-signing.env`, the machine presets under `packaging/presets/`, and the Tencent COS publication credentials. The fork needs none of them to produce an installer for its own use, yet each one occupied this repository's Actions tab and waited for configuration the fork would never supply.

The fork also had no way to obtain a Windows installer from GitHub alone. The upstream packaging workflow was manual, refused to build without the signing hardware, and targeted the upstream release channels and update feeds.

## Decision

The fork runs the twelve general-purpose workflows and one of its own. The twenty upstream publication and governance workflows are gone, together with the `.github/issue-management/` directory and the `.github/preview-sizing/` directory that documented the removed Cloudflare preview lane. The removed publication sequence was `release.yml`, `release-publish.yml`, `release-vendor.yml`, `release-vendor-publish.yml`, `python-release.yml`, `publish-ssh-helper.yml`, `node-addon-system-release.yml`, and `desktop-publish.yml`. The removed Desktop packaging was `windows-package.yml`, `macos-package.yml`, `macos-intel-package.yml`, and `cua-helper-package.yml`. The removed governance robots were `issue-lifecycle.yml`, `issue-policy.yml`, `pr-check-after-approve.yml`, `pr-check-on-base-branch.yml`, `pr-check-on-head-branch.yml`, `weighted-approval.yml`, `weighted-approval-review-event.yml`, and `build-preview-cloudflare.yml`.

The kept set is the quality gate and the documentation site: `ci.yml`, `ci-master.yml`, `ci-python.yml`, `ci-windows.yml`, `e2e.yml`, `pi-ai-provider-e2e.yml`, `sandbox.yml`, `node-addon-system.yml`, `expected-filenames.yml`, and `docs-pages.yml`, plus the two reusable build workflows the kept CI calls. `build-exe-for-python-sdk.yml` is called by `ci-master.yml` and `ci-python.yml`, and `build-exe-for-ssh-helper.yml` is called by `ci-master.yml`, so both stay. The `.github/review-ownership/` directory stays because `ci-python.yml` runs its Python tests.

`.github/workflows/build-windows-installer.yml` builds the fork's own unsigned Windows x64 installer and publishes it as a GitHub Release. It listens to `v*` tag pushes and to `workflow_dispatch`; the tag names the release, and the tag's suffix is the build version, which `apps/desktop/scripts/prepare-windows-ci.mjs` validates against the product version of the checked-out tree before any build work starts. A tag that does not extend that version fails before the build rather than producing a release.

The job runs on the GitHub-hosted `windows-2025` image, which carries Visual Studio Enterprise 2022 with `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`, the Windows SDK 10.0.26100, VSWhere 3.1.7, Python 3.12.10, 7zip, and Node 24. That satisfies the repository's `desktop-toolchain-preflight.ts` probe without installing a toolchain and without a self-hosted runner, so the unsigned mode needs no signing certificate and no publication credential. The job writes its own unsigned preset under `DSH_PACKAGING_CONFIG_DIR`, naming a reserved non-resolving host as the mandatory-update origin so that a policy query records `unavailable` without blocking the application. It points `DSH_DESKTOP_PACKAGE_CACHE_DIR` and `ELECTRON_BUILDER_CACHE` at cached directories so the pnpm store, the primary-runtime archives, and the electron-builder toolset survive between runs.

`apps/desktop/scripts/prepare-package-set.ts` reads packed manifests through `scripts/release/tarball.ts` instead of repeating the read locally. GNU tar on Windows reads the colon in an absolute path as a remote-host separator, and the shared reader already runs tar beside the archive under a relative name; the local duplicate omitted that working directory and was the last absolute-path tar call on the Desktop packaging path.

The tests that asserted the removed workflows went with them. `scripts/windows-package-workflow.spec.ts`, `scripts/macos-package-workflow.spec.ts`, `scripts/desktop-publish-workflow.spec.ts`, `scripts/preview-workflow.spec.ts`, `scripts/desktop-package-forms.spec.ts`, and `scripts/tests/ci-release-selfhosted.spec.ts` are gone, together with `scripts/desktop-archive-workflow-test.ts`, the shared archival helper only those specs used. Five remaining test files keep their coverage of the workflows that stayed: `scripts/ci-workflow.spec.ts` drops the release, publication, lifecycle, weighted-approval, and policy blocks and reads the remaining workflows; `scripts/client-build-environment.client.spec.ts` and `scripts/tests/ci-master-platforms.spec.ts` drop the removed workflow names from their lists; `scripts/cua-helper/payload.spec.ts` and `apps/desktop/tests/desktop-publish-local-preflight.spec.ts` drop the assertions that read the removed workflow files.

`.github/AGENTS.md` describes the fork's workflow set and the tag route. `.github/fork-sync.md` and its Chinese counterpart end the upstream-sync route with a tag rather than a local build. The cross-links in the upstream notes and documents that pointed at the removed files became plain-text references, so the fork keeps the upstream decisions readable without claiming the removed mechanisms still exist.

## Verification

`apps/desktop/scripts/prepare-package-set.ts` was run against this checkout's packed tarballs on a GNU tar host and produced the package set; the same input failed before the change with `tar (child): Cannot connect to C: resolve failed`.

`apps/desktop/scripts/prepare-windows-ci.mjs` was run with the workflow's own preset and environment and resolved the version `0.2.2-rc.1.20261108.1` into the step output.

The typecheck gate passes, the lint gate reports no error, the markdown-link gate passes over 2448 files, and the bilingual pairing gate passes over 1219 pairs. The workflow-facing test files pass: `scripts/ci-workflow.spec.ts` runs 46 tests, and the desktop, cua-helper, and CI platform specs pass alongside it. The documentation build and the documentation site checks fail on this host for reasons that predate the change: esbuild 0.21.5 rejects the `es2024` target, and creating a symlink under the Windows temporary directory needs a privilege the account lacks.

## Alternatives considered

**Keep the upstream publication workflows for future use.** Rejected because they fail on configuration the fork will never hold, and a workflow that always fails teaches the reader to ignore the Actions tab.

**Build the installer on the fork owner's own machine as a self-hosted runner.** Rejected because the runner must stay online and configured, which moves the dependency the workflow was meant to remove. The hosted Windows image already carries the compiler and the SDK the packaging needs.

**Publish the installer to Tencent COS like the upstream does.** Rejected because it needs bucket credentials and a domain this fork does not own, and a GitHub Release in the fork's own repository gives the same download without either.

**Automatically merge upstream into the fork and build from the merge result.** Rejected because the merge conflicts need a human, and a build that silently merges upstream before packaging would ship a tree no one reviewed.

**Trigger the build on every push to `master` instead of on a tag.** Rejected because the release identifier would then have to be invented per run, and a tag already names the release and cannot collide with an earlier one.

**Sign the installer.** Rejected because signing requires the EV token and its signing machine, which is exactly the upstream infrastructure the fork removed.

**Work around the Windows tar defect with `TAR_OPTIONS=--force-local`.** Rejected because the flag is a GNU tar extension that other tar implementations reject, and the shared reader already carries the correct handling.

## Consequences

The fork's installer route is a version tag, a hosted runner, and a GitHub Release. The upstream merge remains a manual step: the fork syncs upstream through a pull request as `.github/fork-sync.md` describes, and the tag that follows it produces the installer.

Actions minutes are the running cost. A full build compiles every workspace package, downloads the primary runtime, and compresses roughly one gigabyte into the installer, so a tag spends twenty to forty minutes of Windows runner time, and the first run is the slowest because it populates the caches.

The fork inherits branch protection settings from its upstream origin. A required status check whose workflow no longer exists can never report, which leaves pull requests permanently unmergeable, so the repository settings must drop the check names of the removed workflows. The working tree cannot change them.

The `windows-2025` label tracks a rolling image. An image that drops the Visual Studio C++ component fails the packaging preflight until the workflow installs the toolchain itself.

The published installer carries no signature, so Windows shows an unknown-publisher warning on first launch. The fork has no signing identity, and that is the accepted cost of removing the upstream signing infrastructure.

The build's mandatory-update origin does not resolve, so the packaged application is never forced to update and never blocks startup on that query. The installer therefore cannot receive upstream's mandatory security updates, and the fork's own update route is out of scope.
