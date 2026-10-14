# 内联资源预处理

只在 base64/data URI 明显占用上下文时执行。脚本复制 Vue 源目录到工作区，提取副本中的 data URI；原始 Vue 源码不会被改写。

```bash
node "$SKILL_DIR/scripts/extract-inline-assets.js" \
  --sourceDir "$SOURCE_DIR" \
  --outputDir "$WORKSPACE_DIR/preprocessed-source"
```

输出：

- `preprocessed-source/`：保持相对目录的源码副本；
- `preprocessed-source/assets/`：按内容 hash 命名的资源；
- `preprocessed-source/asset-manifest.md`：源文件、MIME、hash 和生成路径。

后续分析可把副本作为 `SOURCE_DIR`，但 Source 注释仍写原项目相对路径。

安全规则：

- 输出目录不能等于、包含或位于源目录内，避免递归复制和覆盖。
- 只替换可无损解码的 base64 data URI；解码失败保留原文并报告。
- 动态 SVG、带 Vue 指令/事件/CSS 变量/动画的内联 SVG 保留源码，不自动改成 Image。
- 重复运行按内容 hash 复用资源，结果应幂等。
- 执行后用 `git diff -- <SOURCE_DIR>` 或内容 hash 确认源目录未变化。
