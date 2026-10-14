---
name: template-vue3tokuikly
description: Template project business knowledge plugin for vue3tokuikly skill. Provides business keyword mappings, conversion rules, code checklists and example code specific to Template project. Use as a business extension when converting Vue pages to Kuikly in the template project.
---

# Template Vue3ToKuikly 业务知识 Skill

## 概述

本 Skill 提供 Template 项目中 Vue 转 Kuikly 的业务逻辑知识，作为 `vue3tokuikly` 框架 Skill 的业务扩展插件。

## 与主 Skill 的关系

本目录是业务 Skill 模板，不负责独立完成 Vue3 转 Kuikly。实际项目应复制本目录并按项目改名、补充规则，然后由主 Skill `vue3tokuikly` 显式加载：

```bash
cp -R vue3tokuikly-config-skill myproject-vue3tokuikly

bash vue3tokuikly/scripts/build-knowledge-cache.sh \
  --pageName Vue3App \
  --workspaceDir .vue3tokuikly/Vue3App \
  --businessSkill ./myproject-vue3tokuikly
```

如果未传入 `--businessSkill`，主 Skill 会执行通用迁移，不会自动读取本目录。

## 使用事件上报（必须执行）

**每次 Skill 被调用时，必须首先执行：**

```bash
bash "${SKILL_DIR}/scripts/beacon-report.sh" &
```

## 路径配置（PATH_CONFIG）

> ⚠️ **重要**：`build-knowledge-cache.sh` 脚本会从本节的 `PATH_CONFIG` 块中动态解析资源路径，**不要删除或修改此块的格式**。
> 业务 Skill 通过此配置块声明自己的资源路径，主 Skill 脚本会自动读取，无需硬编码。

<!-- PATH_CONFIG_START -->
```
EXAMPLE_CODE=references/kuikly-example-code.md
CHECKLIST=references/checklist.md
BIZ_KEYWORDS_MAP=references/vue-business-keywords.md
BIZ_RULES_DIR=references/vue3tokuikly-rules
BIZ_BASE_RULES=references/vue3tokuikly-rules/基础业务逻辑.md
```
<!-- PATH_CONFIG_END -->

**配置说明**：
| 配置项 | 说明 | 是否必选 |
|--------|------|----------|
| `EXAMPLE_CODE` | 参考示例代码，包含完整的 Kuikly 页面示例（文件结构、Pager 入口、ComposeView、数据模型等） | ✅ 必选 |
| `CHECKLIST` | 代码规则检查清单，生成代码后逐文件检查和修正（含基本规则、属性检查、页面规则等） | ✅ 必选 |
| `BIZ_KEYWORDS_MAP` | 业务关键字与代码特征的映射定义，用于识别页面涉及的业务 | ✅ 必选 |
| `BIZ_RULES_DIR` | 业务规则文档目录，按关键字存放转换规则 | ✅ 必选 |
| `BIZ_BASE_RULES` | 通用必读的基础业务规则文档，无需关键字匹配，所有页面都会自动加载 | ✅ 必选 |

## 业务关键字与规则文档

读取 [vue-business-keywords.md](references/vue-business-keywords.md) 获取所有业务关键字及其对应的代码特征。格式为：
- `【业务关键字】` — 后面列出该业务对应的代码关键字
- 当源码中出现对应代码特征时，判定页面涉及该业务

根据匹配到的业务关键字，读取 `references/vue3tokuikly-rules/` 下的对应规则文档：

| 业务关键字 | 规则文档路径 |
|-----------|-------------|
| （通用必读，由 `BIZ_BASE_RULES` 自动加载） | [基础业务逻辑.md](references/vue3tokuikly-rules/基础业务逻辑.md) |
| 本地存储 | [本地存储.md](references/vue3tokuikly-rules/本地存储.md) |
| 平台设备信息 | [平台设备信息.md](references/vue3tokuikly-rules/平台设备信息.md) |
| 时间 | [时间.md](references/vue3tokuikly-rules/时间.md) |
| 滑动加载更多 | [滑动加载更多.md](references/vue3tokuikly-rules/滑动加载更多.md) |
| 自定义子组件 | [自定义子组件.md](references/vue3tokuikly-rules/自定义子组件.md) |

> **说明**：`基础业务逻辑.md` 为通用必读文档，包含所有页面都需要的基础转换规则。其余文档按业务关键字按需读取。
