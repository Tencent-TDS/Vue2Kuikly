# 迁移依赖分层预检

用于多个 Vue/JS/TS 文件需要批量迁移时。目标是先算出迁移顺序，避免先迁移上层页面导致缺少基础组件和工具。

## 扫描范围

识别 `.vue`、`.js`、`.ts`、`.jsx`、`.tsx` 文件，并解析：

- `import ... from "..."`
- `require("...")`
- Vue `components: { ... }` 局部注册
- template 中真实使用的自定义组件标签

只关注内部依赖：

- `./xxx`
- `../xxx`
- `@/xxx`
- 项目内 alias

忽略标准库和第三方库，如 `fs`、`path`、`lodash`、`axios`。

## 依赖图

把每个文件作为节点，把“当前文件依赖目标文件”作为边。

需要标记：

- 无法解析的路径
- 循环依赖
- 仅 import 但 template 未使用的组件
- template 使用但未 import 或未注册的组件

## Tier 计算

- Tier 0：无内部依赖的基石层，如纯工具、常量、原子组件。
- Tier 1：只依赖 Tier 0。
- Tier N：只依赖 Tier 0 到 Tier N-1。
- Tier X：无法解析、循环依赖或依赖关系不完整的文件。

迁移顺序必须从 Tier 0 到 Tier N。页面通常排在较高层，工具、API、基础组件排在低层。

## 文件类型分类

按路径和内容标记类型：

| 类型 | 识别特征 |
| --- | --- |
| Utils | `utils/`、纯函数、常量、format、date |
| API | `api/`、`request`、`smartFetch`、接口 key |
| Component | `components/`、有 `props`、被页面 template 使用 |
| Page | `views/`、`pages/`、路由入口 |
| Store | `store/`、`vuex`、状态管理 |

## 输出格式

输出 Markdown 表格，按 Tier 从低到高排序：

```markdown
| 优先级 | 迁移层级 | 文件路径 | 文件类型 | 内部依赖 | 备注 |
| --- | --- | --- | --- | --- | --- |
| P0 | Tier 0 | src/utils/date.js | Utils | 无 | 建议优先迁移 |
| P0 | Tier 0 | src/components/BaseBtn.vue | Component | 无 | 基础 UI 组件 |
| P1 | Tier 1 | src/api/user.js | API | src/utils/request.js | 等 request 迁移后处理 |
| P2 | Tier 2 | src/views/Home.vue | Page | src/api/user.js, src/components/BaseBtn.vue | 页面级最后迁移 |
```

若发现循环依赖，在备注中写明循环链路，并把相关文件标为高风险。
