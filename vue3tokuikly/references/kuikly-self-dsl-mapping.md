# Kuikly 自研 DSL 对照

## 目录

1. 事实来源
2. 页面与组件
3. 响应式与 directives
4. 常用组件
5. 生命周期和资源清理
6. KMP 边界

## 1. 事实来源

API 优先级：目标项目可编译示例 > 同版本 Kuikly 源码/文档 > 本文候选写法。先用 `rg` 搜索同一组件、attr、event 和 module；不要为消除编译错误创造目标项目不存在的扩展。

## 2. 页面与组件

自研 DSL 基础页面通常继承目标项目的 `Pager`/`BasePager`，以 `@Page` 注册，并让 `body()` 或 `buildBody()` 返回 `ViewBuilder`。页面类名、UI 文件名和基类必须跟随目标项目。

普通组件模式：

```kotlin
internal class ExampleView : ComposeView<ExampleAttr, ExampleEvent>() {
    override fun createAttr() = ExampleAttr()
    override fun createEvent() = ExampleEvent()

    override fun body(): ViewBuilder {
        val ctx = this
        return {
            View {
                attr { flex(1f) }
                event { click { ctx.event.onClick?.invoke() } }
            }
        }
    }
}

internal class ExampleAttr : ComposeAttr() {
    var title by observable("")
}

internal class ExampleEvent : ComposeEvent() {
    var onClick: (() -> Unit)? = null
}
```

Attr 是否用 observable 取决于父级赋值后是否需要驱动子 UI 更新；先跟随目标组件模式。事件参数保持 Vue emit 的类型和顺序。

## 3. 响应式与 directives

- 单值：`var count by observable(0)`。
- 增量列表：`var items by observableList<Item>()`。
- 条件链：`vif({ condition }) { ... }`、紧随其后的 `velseif`、`velse`。
- 响应式循环：`vfor({ items })` 或 `vforIndex({ items })`。
- 大列表：`List { vforLazy({ items }) { item, index, count -> ... } }`。
- `vfor*` item creator 必须创建且仅创建一个非 directive 根节点。
- `vbind` 会重建绑定容器的子节点；仅在确实需要按离散状态重建整块 UI 时使用。

手工监听表达式可使用当前版本的 `bindValueChange`，但它首次绑定立即回调。迁移 Vue watch 时按 `immediate` 修正，并在销毁时 unbind。

## 4. 常用组件

| 源行为 | 候选组件 | 关键核对项 |
| --- | --- | --- |
| 通用布局 | `View` | flex、绝对定位、裁剪、点击 |
| 纯文本 | `Text` | lines、lineHeight、overflow、对齐 |
| 多段富文本 | `RichText` + Span | span 点击、换行、截断 |
| 图片 | `Image` | src、resize/fit、圆角、placeholder/error |
| 单行/多行输入 | `Input` / `TextArea` | `textDidChange { it.text }`、focus、IME、selection |
| 普通滚动 | `Scroller` | 方向、content size、滚动事件 |
| 长列表 | `List` | item 根节点、首屏、滚动位置 |
| 下拉刷新 | `List` 内 `Refresh` | 状态机、`endRefresh()`、并发保护 |
| 上拉加载 | `List` 内 `FooterRefresh` | preload、finished/error/reset、并发保护 |
| 分页容器 | `PageList` | 页面尺寸、index 事件、程序化切换 |
| 轮播 | `SliderPage` | loop、interval、首尾复制、index 回调 |
| 弹层 | `Modal`/`AlertDialog`/`ActionSheet` | 遮罩、返回键、dismiss、层级 |

Vant/业务组件不得仅依据名字选择本表组件；先看其 props、events 和运行状态。

Input/TextArea 的当前事件参数是对象，文本通常从 `it.text` 读取。列表 Refresh/FooterRefresh 是 List 子节点。SliderPage 通过 `initSliderItems` 创建页面并以 `pageIndexDidChanged` 回调 index；具体签名以目标 Kuikly 版本为准。

## 5. 生命周期和资源清理

`ComposeView` 的关键顺序是 `created`、`viewWillLoad`、创建 body、`viewDidLoad`、布局后 `viewDidLayout`；移除时依次进入 unload/destroy 钩子。Pager 另有 `pageDidAppear/pageDidDisappear/pageWillDestroy`。

- 页面定时器、observer、请求回调和事件监听在 `pageWillDestroy()` 清理。
- 组件资源在 `viewDestroyed()` 清理；需要卸载前行为时使用 `viewWillUnload()`。
- `setTimeout` 保存返回 ref，并使用当前 `PagerScope.clearTimeout(ref)` 形态；旧的全局 clearTimeout 可能已弃用，先看版本。
- Timer、Notify/EventBus、Module listener 都必须成对释放。
- 异步回调在写 UI 状态前确认页面/组件仍存活，优先使用目标项目生命周期 scope。

## 6. KMP 边界

- 协程使用 `com.tencent.kuikly.core.coroutines.*` 或目标项目封装，不用 `kotlinx.coroutines`。
- JSON 使用 `com.tencent.kuikly.core.nvi.serialization.json.JSONObject`，不用 `org.json`。
- commonMain 不使用 Android/iOS/browser 专属 API；原生能力走现有 Module/Bridge。
- 样式使用函数调用，如 `width(100f.px)`，不写属性赋值式伪 DSL。
- 不把 API key、token 或内网地址从 Vue 字面量扩散到新代码；使用目标项目安全配置。
