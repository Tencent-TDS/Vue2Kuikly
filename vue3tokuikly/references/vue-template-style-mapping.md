# Vue 模板与样式映射

## 目录

1. 节点与指令
2. 事件与双向绑定
3. class/style 与 CSS
4. 资源与可访问行为

## 1. 节点与指令

| Vue 模板 | Kuikly 自研 DSL 候选 | 约束 |
| --- | --- | --- |
| `div/section/main/header/footer` | `View` | 保留实际布局层级；无样式且无语义的节点也要先确认是否影响 flex/事件 |
| `span/p/label` | `Text` 或 `RichText` | 混合文本、内嵌节点和多段样式优先核对 RichText |
| `img` | `Image` | 保留 fit、裁剪、圆角、加载失败和点击行为 |
| `input` | `Input` | 单行输入 |
| `textarea` | `TextArea` | 多行、行高、行数和自适应高度 |
| `v-if/v-else-if/v-else` | 连续 `vif/velseif/velse` | 条件闭包读取响应式状态；分支必须相邻 |
| `v-for` | `vfor`/`vforIndex`/`vforLazy` 或 Kotlin 循环 | 响应式增量列表用 directive；静态集合可原生循环 |
| `v-show` | 目标项目的隐藏/显示能力 | `v-show` 保留实例和状态，不能用销毁节点的 `vif` 冒充 |
| `v-html` | RichText/HTML 渲染封装 | 先确认安全过滤和目标项目能力，不能直接显示原始标签文本 |
| `v-bind` / `$attrs` | 显式 attr 赋值/透传 | 动态参数、对象合并和覆盖顺序 |
| `v-on` 对象 | 显式 event 注册 | 动态事件名、listener 覆盖和移除 |
| `v-once` / `v-memo` | 静态节点或受控重建 | 保留“不随哪些状态更新”的边界，不能简单删除 |

Vue3 fragment 可对应同一容器内多个子节点，但 `vfor`/`vforIndex`/`vforLazy` 的 item creator 必须且只能创建一个非虚拟根节点。循环项内有 fragment、`v-if` 或多个兄弟时包一层确有布局等价性的 `View`，并审计这层 View 对 flex、事件和样式的影响。

`vforLazy` 只用于 `List`；其数据源必须是 `ObservableList`。普通 View/Scroller 下的静态循环使用 Kotlin `forEach`，需要响应式增量时使用适合该容器的 directive。

`key` 决定 Vue 节点身份。Kuikly 无法直接表达同一 key 机制时，保持数据模型稳定身份、列表更新顺序和组件本地状态归属；禁止默认用 index 代替业务 key。

## 2. 事件与双向绑定

- `@click="fn"` 映射到 `event { click { ... } }`，保留事件参数、返回路径和防重复逻辑。
- `.stop/.prevent/.capture/.once/.passive/.self` 是行为，不是可丢弃语法。逐个搜索 Kuikly 事件 API；没有等价能力时在父子事件链上显式实现并记录差异。
- `@keyup.enter` 等键盘修饰符需要目标 Input/TextArea 的键盘事件和 IME action，不能只监听文本变化。
- 原生 input 的 `v-model` 通常是 `attr { text(value) }` + `event { textDidChange { value = it.text } }`。以当前 Kuikly 版本签名为准。
- 组件 `v-model` 是 `modelValue` prop + `update:modelValue` 事件协议；有参数或 modifier 时分别迁移名称、转换和触发时机。
- `.lazy/.trim/.number` 必须保留。确认是在输入中、失焦时还是提交时转换，并保留非法数字处理。
- 自定义 directive 的 mounted/updated/unmounted、参数和 modifiers 都是运行逻辑。先搜索目标扩展或把行为显式落到组件生命周期，不能只删除 `v-xxx` 属性。

## 3. class/style 与 CSS

先计算 Vue 最终样式，再翻译为 Kuikly attr；不要只逐条翻译而忽略 cascade、scoped、`:deep()`、媒体条件和动态 class 的覆盖顺序。

规则：

1. 目标项目尺寸体系优先。本仓库自研 DSL 约定使用 `px` 函数体系，如 `width(100f.px)`；比例、flex、opacity、zIndex 和 line count 不加 `px`。
2. 不存在通用的“所有 px 乘二”或“所有 rpx 减半”。`750rpx` 设计满宽优先映射 `pagerData.pageViewWidth`；其他值按目标项目设计适配器核对。
3. `width: 100%` 只有在父级 flex 语义等价时才可用 `flex(1f)`；绝对布局、横向布局和固有尺寸场景需要明确宽度。
4. `position: fixed/sticky`、overflow、transform、shadow、渐变、滤镜和动画先搜索现有 API/封装，不能按名字猜属性。
5. Text/Image/Input 等叶子组件的容器属性受限。padding、子节点或布局需求通常需要外层 View，但新增外层必须保持尺寸与事件语义。
6. `::before/::after` 生成的可见内容是 UI，必须迁移成显式节点；纯装饰也不能遗漏。
7. CSS transition/animation 要保留触发条件、持续时间、delay、easing、重复和取消；没有等价 API 时列为运行差异。
8. 颜色使用 KMP/Kuikly `Color`，不使用 Android `Color.parseColor()`。

## 4. 资源与可访问行为

- 保留图片 URI 类型：远程 URL、项目 assets、data URI、运行时生成内容的加载方式不同。
- 静态 SVG 可以转为目标支持的资源；带绑定、事件、动画、CSS 变量或动态 path 的 SVG 不能静态化。
- `alt`、disabled、focus、keyboard、可点击区域和 loading/error placeholder 会影响交互或可访问性时，寻找目标等价能力并纳入审计。
- 内联资源过大时使用预处理脚本生成工作区副本，原 Vue 文件保持不变。
