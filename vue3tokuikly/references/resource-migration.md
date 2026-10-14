# 资源迁移

## 目录

1. 资源分类
2. Kuikly 目标约定
3. 标准流程
4. 特殊资源
5. 完成门禁

## 1. 资源分类

逐项扫描并建立 manifest，不能只迁移 `<img>`：

| Vue/Vite 来源 | 迁移要求 |
| --- | --- |
| `import logo from './logo.png'`、`require()`、`new URL(..., import.meta.url)` | 解析真实文件并复制 |
| template `src/href/poster`、CSS `url()`、`@font-face` | 解析相对、`@/` 和 public 根路径 |
| `public/foo.png` / `src="/foo.png"` | 从 public 根复制，不保留 Web 根路径假设 |
| data URI/base64 | 解码为目标 asset；原 Vue 文件保持不变 |
| 静态 inline SVG | 可提取，但使用前确认目标 Image adapter 支持 SVG |
| 动态 SVG | 保留绑定、事件、CSS 变量和动画，不能静态化 |
| HTTP(S) URL | 不复制，保持 URL、参数、placeholder、失败和缓存行为 |
| 动态 `:src` / blob / FileReader / canvas URL | 追踪所有运行时值，映射为目标 URL、file、base64 或 Module |
| Vant/组件库 icon name | 映射到目标现有 asset/icon module；名字本身不是图片 URI |
| 字体 | 复制文件只是第一步，还要完成宿主注册与各平台验证 |
| JSON/Lottie/PAG/音视频 | 复制资源并使用对应 Kuikly 组件/读取 API，不一律交给 Image |

只复制源代码实际引用或已证明由运行时名称查找的资源。`assets/`/`public/` 中未引用文件进入 review 清单，不能自动全量复制，也不能静默忽略。

## 2. Kuikly 目标约定

先搜索目标工程。标准 KuiklyUI module 通常使用：

```text
<module>/src/commonMain/assets/
├── common/<shared-resource>
└── <PageName>/<page-resource>
```

- 页面图片：复制到 `assets/<PageName>/...`，Kotlin 使用 `ImageUri.pageAssets("...")`。
- 公共图片：复制到 `assets/common/...`，Kotlin 使用 `ImageUri.commonAssets("...")`。
- `pageAssets` 的 namespace 必须与运行时 `@Page` 名称一致，不要用 Kotlin 类名猜。
- 远程 URL 继续传给 `src(url)`；本地文件路径使用 `ImageUri.file(path)`，它不是打包 asset。
- 字体、JSON/Lottie/PAG、音视频虽放在 assets 中，也必须使用目标项目对应模块或宿主注册方式；`ImageUri` 建议只适用于图片。

多 module iOS 工程还要确认目标 module 的 CocoaPods resources 配置包含 `src/commonMain/assets/**`；不能只以 Android 编译通过判断资源已打包。

## 3. 标准流程

先生成资源计划，不修改目标 assets：

```bash
node "$SKILL_DIR/scripts/migrate-resources.js" \
  --mode plan \
  --pageName "$PAGE_NAME" \
  --sourceDir "$SOURCE_DIR" \
  --outputDir "$OUTPUT_DIR" \
  --workspaceDir "$WORKSPACE_DIR" \
  --aliasDir "<src alias root>" \
  --assetNamespace "<运行时 @Page 名称>" \
  --assetScope page
```

读取：

- `cache/resource-manifest.md`：物理资源、远程 URL、动态引用、符号图标和未引用资源；
- `cache/resource-manifest.json`：机器可验证清单；
- `cache/resource-mappings.json`：动态/符号/字体等人工映射证据。

确认 namespace、目标目录和冲突后执行复制：

```bash
node "$SKILL_DIR/scripts/migrate-resources.js" \
  --mode apply \
  --pageName "$PAGE_NAME" \
  --sourceDir "$SOURCE_DIR" \
  --outputDir "$OUTPUT_DIR" \
  --workspaceDir "$WORKSPACE_DIR" \
  --aliasDir "<src alias root>" \
  --assetNamespace "<运行时 @Page 名称>" \
  --assetScope page
```

脚本会递归扫描入口的本地文本依赖，并盘点入口、依赖目录、`src/assets` 和 `public`。它只复制 manifest 中可确定的资源：目标不存在则创建；内容相同则复用；同路径内容不同或存在未解析本地资源则停止，不产生部分复制。

生成 Kotlin 时使用 manifest 给出的 `ImageUri` 表达式，并给资源引用写 `Source:`。对每个 `needs-mapping` 项在 `resource-mappings.json` 填写：

```json
{
  "mappings": {
    "<record-id>": {
      "resolution": "runtime|existing-target|converted|host-registered|not-used",
      "copy": false,
      "uriPath": "可选；相对 page/common namespace 的目标路径",
      "evidence": "生成 Kotlin 中可检索的精确 token",
      "note": "为何与源行为等价"
    }
  }
}
```

`not-used` 只允许用于 `unreferenced` 记录，必须写明排除依据，此时可省略 `evidence`。其他 resolution 都必须提供能在 Kotlin 中精确检索到的 evidence。动态名称已证明会命中的未引用物理资源使用 `resolution: runtime|converted` + `copy: true`；脚本会按 hash 复制，`uriPath` 缺省时沿用源相对路径。非图片资源、SVG、动画图片、`?inline` 及平台兼容性敏感格式即使已复制，也仍需 mapping。

## 4. 特殊资源

- `?raw`：源语义是读取文件内容，不能改成 asset URL；迁移为 Kotlin 字符串/解析逻辑或目标读取 API。
- `?url`：按 URL asset 处理；`?inline` 需保留是否必须内联的行为约束。
- SVG/WebP/APNG/GIF：先确认目标 image adapter 与五端支持；不支持时使用项目已有转换产物，不能擅自改变图像。
- 字体：保留 font-family、weight/style 和 fallback；确认 Android/iOS/OHOS/Web 注册方式及许可证。
- 组件库图标：优先复用目标项目同语义图标；没有时从合法源资源迁移。禁止按名称臆造图形。
- runtime 资源名拼接：枚举实际可能值；对本地闭合集合逐项使用 `copy: true`，开放集合需保留注册/下载机制。

## 5. 完成门禁

完成 Kotlin 迁移后执行：

```bash
node "$SKILL_DIR/scripts/migrate-resources.js" \
  --mode validate \
  --pageName "$PAGE_NAME" \
  --workspaceDir "$WORKSPACE_DIR" \
  --kotlinDir "$OUTPUT_DIR"
```

必须同时满足：

- 每个确定的本地资源存在且 SHA-256 与源一致；
- Kotlin 中存在对应完整 `ImageUri` 表达式，或 mapping 提供可检索证据；
- 每个动态 URL、Vant 图标、动态 SVG、runtime 资源和字体都有完整 mapping；
- remote URL 没有被无依据替换；
- 每个未引用资源都有 `not-used` 结论，或有运行时/目标复用证据；
- Android 编译之外，至少验证一个实际资源加载路径；涉及字体/SVG/多 module 时补对应平台验证。
