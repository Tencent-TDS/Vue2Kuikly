# 业务 Skill 契约

业务 Skill 可选。没有业务 Skill 时使用通用 Vue3/Kuikly 规则继续，并在最终审计记录“未应用业务规则”。

## 资源声明

业务 Skill 可在其 `SKILL.md` 中声明：

```text
<!-- PATH_CONFIG_START -->
EXAMPLE_CODE=references/kuikly-example-code.md
CHECKLIST=references/checklist.md
BIZ_KEYWORDS_MAP=references/vue-business-keywords.md
BIZ_RULES_DIR=references/vue3tokuikly-rules
BIZ_BASE_RULES=references/vue3tokuikly-rules/base.md
<!-- PATH_CONFIG_END -->
```

所有路径相对业务 Skill 根目录解析。业务 Skill 参数既可为目录路径，也可为可发现的 Skill 名称。找不到或配置不完整时停止应用业务规则，但不要阻塞可独立完成的通用迁移。

## 按需读取

1. 先读取 `BIZ_KEYWORDS_MAP`，只匹配当前源文件和被引用导出。
2. 只读取命中的规则文件和 `BIZ_BASE_RULES`，不要合并整个规则目录。
3. `EXAMPLE_CODE` 只用于确认项目架构/API，不可把示例业务字段复制到产物。
4. `CHECKLIST` 在每文件迁移后和最终审计各执行一次。

## 优先级

源代码行为 > 目标项目当前可编译 API > 已验证业务规则 > 通用候选映射。

业务规则不能授权遗漏源逻辑、创造新功能、混用 DSL、写入 secret 或使用 commonMain 禁止依赖。规则与源行为或目标 API 冲突时记录冲突并请求业务决策，不静默选择。

## reference manifest

可运行 `build-knowledge-cache.sh` 生成短小的 `reference-manifest.md`。该脚本只列出要按需读取的路径，不复制文档正文，避免大知识缓存破坏渐进式披露。
