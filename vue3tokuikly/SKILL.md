---
name: vue3tokuikly
description: 将 Vue 3 单文件组件、页面、项目模块及图片/字体/SVG/音视频/JSON 等资源一对一迁移为 Kuikly/Kotlin Multiplatform 代码，并完成依赖排序、Vue3 Composition API 与 script setup 语义映射、模板和样式翻译、第三方组件行为对照、资源清单与复制校验、Source 可追溯注释、编译修复和迁移审计。用于迁移或补齐 Vue3 页面/组件，处理 ref/reactive/computed/watch、defineProps/defineEmits/v-model、Vue Router、Pinia、Vant、本地或动态资源，或修复 Vue3 转 Kuikly 后的语义、资源与编译问题。
---

# Vue3 to Kuikly

把 Vue3 代码翻译为 Kuikly 代码，不重写产品。以源代码行为和目标 Kuikly 项目现有 API 为双重事实来源。

## 主 Skill 与业务 Skill

`vue3tokuikly/` 是主 Skill，负责通用的 Vue3 到 Kuikly 转码流程。`vue3tokuikly-config-skill/` 是业务知识 Skill 模板，不是第二个主 Skill，也不会自动注入到每次迁移中。

为具体项目接入业务规则时：

1. 复制 `vue3tokuikly-config-skill/`，例如命名为 `myproject-vue3tokuikly/`。
2. 修改副本 `SKILL.md` 的 frontmatter `name`，补充 `references/` 下的项目规则、示例和 Checklist。
3. 保留 `PATH_CONFIG_START` / `PATH_CONFIG_END` 标记及五项配置，让脚本能定位业务资源。
4. 建立知识缓存时显式传入业务 Skill：

```bash
bash "$SKILL_DIR/scripts/build-knowledge-cache.sh" \
  --pageName "$PAGE_NAME" \
  --workspaceDir "$WORKSPACE_DIR" \
  --businessSkill "<项目业务 Skill 路径>" \
  --bizKeywords "<源码命中的业务关键字，逗号分隔>"
```

调用本 Skill 时，应同时告诉执行者使用哪个业务 Skill。省略 `--businessSkill` 时仍可进行通用迁移，但最终审计必须记录“未应用业务规则”。

## 不变式

1. 保持零创造、零遗漏。逐项迁移状态、props、派生值、watch、副作用、生命周期、模板、样式、事件、请求、存储、路由、依赖组件及其物理/远程/动态资源。
2. 给关键迁移代码写 `// Source: <源文件>: <原始构造>`；不要只写无法定位的笼统注释。
3. 先搜索目标项目和 Kuikly 源码中的现有用法。映射表是候选，不是覆盖目标项目事实的许可。
4. 开工前判定自研 DSL 或 Compose DSL，全程只用一种。本 Skill 的详细映射面向自研 DSL；Compose DSL 目标必须读取目标项目 Compose 示例后另行映射。
5. 使用 Kuikly/KMP API。禁止把 Android、浏览器、Vue API、`kotlinx.coroutines` 或 `org.json` 混入 `commonMain`。
6. 每完成一个可独立编译的迁移批次立即编译。不能编译时记录具体命令、阻塞原因和未验证范围，不能声称通过。
7. 不修改 Vue 源码。资源复制到目标 `commonMain/assets`；需要降低内联资源体积时，只处理工作区副本。

## 确定输入

从用户输入和项目结构推导以下变量；只有无法可靠推导且不同选择会改变产出时才询问：

```bash
SKILL_DIR="<本 SKILL.md 所在目录>"
PAGE_NAME="<页面或迁移单元名称>"
SOURCE_DIR="<Vue3 源文件或目录>"
OUTPUT_DIR="<目标 Kuikly package 对应目录>"
WORKSPACE_DIR="${WORKSPACE_DIR:-.vue3tokuikly/$PAGE_NAME}"
TARGET_PACKAGE="<从 OUTPUT_DIR 的 src/commonMain/kotlin/ 后缀推导>"
TARGET_ASSETS_DIR="<通常从 OUTPUT_DIR 推导为同 module 的 src/commonMain/assets>"
ASSET_NAMESPACE="<运行时 @Page 名称；默认与 PAGE_NAME 相同>"
BUSINESS_SKILL="<可选的业务 Skill 路径或名称>"
```

- 用户给出单文件时，把其父目录作为分析根，同时把该文件标为入口。
- 未给 package 时，从 `src/commonMain/kotlin/` 后路径推导；无法推导时读取相邻 Kotlin 文件。
- 未给业务 Skill 时继续通用迁移，并在审计中记录“未应用业务规则”。
- 不默认把输出写进 Skill 目录。无法推导目标项目时才使用用户项目下的临时工作目录，并明确标记为未集成产物。

## 渐进式披露

只读取本次源码命中的参考文件，不构建大而全的知识正文：

| 命中特征 | 读取 |
| --- | --- |
| 任意 Vue3 `<script setup>`、Composition API 或宏 | [vue3-semantics-mapping.md](references/vue3-semantics-mapping.md) |
| 任意 `<template>`、指令、事件或 `<style>` | [vue-template-style-mapping.md](references/vue-template-style-mapping.md) |
| 自研 DSL 页面、组件、列表、输入、响应式或生命周期 | [kuikly-self-dsl-mapping.md](references/kuikly-self-dsl-mapping.md) |
| Vant、Element Plus、Naive UI 或其他组件库 | [component-library-mapping.md](references/component-library-mapping.md) |
| Router、Pinia、请求、存储、定时器、浏览器或原生能力 | [integration-mapping.md](references/integration-mapping.md) |
| 本地/public/远程/动态资源、CSS URL、字体、SVG、组件库图标或音视频 | [resource-migration.md](references/resource-migration.md) |
| 生成、逐文件校验、编译与最终审计 | [generation-validation.md](references/generation-validation.md) |
| base64 或内联 SVG 造成上下文膨胀 | [preprocess-inline-assets.md](references/preprocess-inline-assets.md) |
| 用户提供业务 Skill | [business-skill-contract.md](references/business-skill-contract.md) |

长参考文件先看目录和命中章节。不要为了“可能用到”加载未命中的组件或业务资料。

## 执行流程

### 1. 学习源与目标

完整读取入口、递归本地依赖、路由、状态仓库、样式和资源。再读取目标目录附近至少一个页面、一个组合组件及其编译配置，确认：

- 页面基类、`@Page` 名称、`body()`/`buildBody()` 约定；
- 页面 UI 文件名及 `buildUI` 签名；
- Attr/Event、导航、网络、存储、图片/字体/媒体资源和尺寸单位写法；
- `src/commonMain/assets` 的 page/common 目录、`@Page` namespace 及各平台打包配置；
- 可用 Gradle module、page 参数及编译命令。

目标项目已有约定优先。没有先例时，自研 DSL 默认生成 `<PageName>Page.kt` + `pageUI.kt`，组件生成单个 `<ComponentName>View.kt`。

### 2. 建立工作区并分析依赖

```bash
bash "$SKILL_DIR/scripts/setup-page-dirs.sh" \
  --pageName "$PAGE_NAME" \
  --sourceDir "$SOURCE_DIR" \
  --outputDir "$OUTPUT_DIR" \
  --workspaceDir "$WORKSPACE_DIR"

bash "$SKILL_DIR/scripts/analyze-file-structure.sh" \
  --pageName "$PAGE_NAME" \
  --sourceDir "$SOURCE_DIR" \
  --outputDir "$OUTPUT_DIR" \
  --workspaceDir "$WORKSPACE_DIR" \
  --aliasDir "<可选的 @/ 根目录>"
```

读取生成的 `cache/analysis-report.md`、`cache/conversion-plan.md` 和 `cache/reference-manifest.md`。脚本只提供确定性清单和候选依赖层级；必须通过源码确认页面/组件角色、动态 import、运行时注册和循环依赖。

转换顺序固定为：

1. Tier 0：模型、类型、常量和纯工具；
2. Tier 1：无状态叶子组件；
3. Tier 2：有状态组件和组合组件；
4. Tier 3：页面；
5. Tier 4：路由或入口装配。

默认自动继续。只有用户要求严格审核，或存在 DSL、页面基类、输出覆盖、跨模块归属等高影响歧义时，展示计划并暂停确认。

### 3. 建立并执行资源清单

资源是迁移产物，不是编译后的补漏项。先生成只读计划：

```bash
node "$SKILL_DIR/scripts/migrate-resources.js" \
  --mode plan \
  --pageName "$PAGE_NAME" \
  --sourceDir "$SOURCE_DIR" \
  --outputDir "$OUTPUT_DIR" \
  --workspaceDir "$WORKSPACE_DIR" \
  --aliasDir "<@/ 根目录>" \
  --assetNamespace "$ASSET_NAMESPACE" \
  --assetScope page
```

读取 `cache/resource-manifest.md`。没有记录时直接继续，不加载资源 reference；有记录时读取 [resource-migration.md](references/resource-migration.md)，逐项确认本地/public/data URI、远程 URL、动态引用、Vant 图标、字体和未引用物理资源。`pageAssets` 的 namespace 必须使用运行时 `@Page` 名；跨页面真实共享资源才选 `--assetScope common`。确认目标目录和冲突后把 `--mode` 改为 `apply` 执行复制。

图片可按 manifest 建议使用 `ImageUri.pageAssets(...)` 或 `commonAssets(...)`。字体、JSON/Lottie/PAG、音视频不能机械翻成 `ImageUri`；必须在 `cache/resource-mappings.json` 记录目标 API、宿主注册或明确的 `not-used` 结论。完整规则见 [resource-migration.md](references/resource-migration.md)。

### 4. 建立语义账本

在分析报告或工作记录中为每个源文件建立表格，至少包含：

| 源构造 | 读写位置 | UI/副作用依赖 | Kuikly 落点 | 状态 |
| --- | --- | --- | --- | --- |
| `ref/reactive/props/computed` | 源行或片段 | 哪些模板/方法读取 | observable/普通字段/Attr/函数 | pending/done |
| `watch/lifecycle` | 依赖与清理 | 请求、监听、定时器 | bind/lifecycle/cleanup | pending/done |
| template/style/event | 标签或选择器 | 条件、循环、交互 | View tree/attr/event | pending/done |
| asset/font/icon/media | 引用与运行时来源 | 加载、失败、缓存、平台支持 | asset URI/目标模块/宿主注册 | pending/done |

语义账本是零遗漏门禁。不要用文件名或组件名猜业务含义。

### 5. 按层迁移

逐文件执行：

1. 先迁移类型、props、状态、派生值、watch、副作用、方法和生命周期，再写 UI。
2. 保持模板节点层级、条件链、循环顺序、key 语义、事件参数和 CSS 覆盖顺序。
3. 第三方组件按实际行为拆解，不按名字替换。无法等价时搜索目标封装；仍无结果则保留可编译边界并报告语义缺口，不静默降级。
4. 页面逻辑与 UI 按目标项目约定分文件；普通 `ComposeView` 的 UI 留在组件 `body()`。
5. 迁移一个文件后更新进度：

```bash
bash "$SKILL_DIR/scripts/update-progress.sh" \
  --pageName "$PAGE_NAME" \
  --workspaceDir "$WORKSPACE_DIR" \
  --step migrate \
  --status file_done \
  --fileInfo "<source> -> <output>" \
  --compileStatus "passed|failed|not_run"
```

### 6. 立即验证

优先使用目标项目已有命令。常见 KuiklyUI demo 示例：

```bash
./gradlew :demo:compileDebugKotlinAndroid -PpageName="$PAGE_NAME"
```

不要把 `kotlinc` 当作 KMP/Gradle 项目的等价验证。修复编译错误时先核对目标 API 和项目示例，不通过创造扩展函数掩盖错误。

### 7. 最终审计

按 [generation-validation.md](references/generation-validation.md) 完成双向核对：

- 源到目标：每个源构造都有落点或明确的阻塞说明；
- 目标到源：每个业务字段、分支、事件、请求和可见节点都有 Source 依据；
- 静态检查：无禁用 import、无 DSL 混用、无未清理资源、无伪编译通过；
- 资源检查：执行 `node "$SKILL_DIR/scripts/migrate-resources.js" --mode validate --pageName "$PAGE_NAME" --workspaceDir "$WORKSPACE_DIR" --kotlinDir "$OUTPUT_DIR"`，hash、URI 和映射证据全部通过；
- 编译检查：目标 module 至少一个平台通过；高风险平台能力按涉及平台补测；
- 运行检查：用户要求或环境可用时，对照关键交互、空态、加载态、错误态和滚动行为。

完成后把 `verify` 标为完成，并报告生成文件、编译命令、验证结果、业务规则使用情况和剩余语义缺口。

## 恢复执行

用户说“继续”时先执行：

```bash
bash "$SKILL_DIR/scripts/check-progress.sh" \
  --pageName "$PAGE_NAME" \
  --outputDir "$OUTPUT_DIR" \
  --workspaceDir "$WORKSPACE_DIR"
```

读取进度、分析报告和当前 git diff，从第一个未完成项继续。用 `check-cache.sh --use-cache auto` 校验逐文件 SHA-256；源文件新增、删除或修改后重新分析。已完成文件只有在源指纹变化、编译失败或审计发现缺口时才重做。

## 禁止模式

- 不把 `ref()` 机械映射成 `observable`，也不把所有普通变量响应式化。
- 不把 `mounted` 一律塞进 `created`；按“UI 树创建、布局完成、页面可见”语义选择生命周期。
- 不把 `watch` 的首次执行、deep、flush 和 cleanup 丢掉。
- 不把 Vant 的刷新、分页、轮播、路由模式降级为同名静态 View。
- 不在 `vfor`/`vforIndex`/`vforLazy` 内生成多个根节点或把 `vforLazy` 放在非 `List` 容器。
- 不改写源资源，不静默遗漏 `assets/`/`public/`/CSS URL/字体/组件库图标，也不把所有资源机械当作图片。
- 不把 API key、平台专属 API 或不存在的 Kuikly 属性写入 commonMain。
- 不以 TODO 代替可从源码和目标项目确定的迁移；真正无等价能力时必须形成可审计的阻塞项。
