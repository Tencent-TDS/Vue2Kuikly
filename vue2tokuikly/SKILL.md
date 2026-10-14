---
name: vue2tokuikly
description: 按当前 KuiklyPolicy 项目规范，将 Vue/Vue2 页面、组件、样式、事件、网络请求、存储、路由参数、Module 调用和商业化页面一对一迁移为 Kuikly/Kotlin Multiplatform 代码。用于用户要求 Vue 迁移 Kuikly、分析迁移依赖层级、补齐或修复 Kuikly 页面/组件、处理 ReqConfig/API 常量、Module/原生能力桥接。
---

# Vue 迁移 Kuikly

## 先读什么

根据任务选择参考资料：

- 迁移前要排序多个 Vue 文件：读 `references/dependency-tier-precheck.md`。
- 真正改代码或修编译错误：读 `references/kuikly-polycity-migration-rules.md`。
- 涉及 Module、业务特有模块方法：读 `references/module-and-business-rules.md`。

## 核心原则

把 Vue 代码翻译为 Kuikly 代码，不做产品优化，不补脑，不基于命名模式创造组件、属性、事件或逻辑。

- 零创造：Vue 源码没有的 UI、样式、逻辑、接口请求、状态、事件、组件都不要新增。
- 零遗漏：Vue 的 `data`、`props`、`computed`、`watch`、`methods`、生命周期、template、style、请求和存储都要逐项迁移。
- 可追溯：关键代码都写 `// 标记来源 xxx.vue 类型: 原始片段`。
- 先学习项目：不确定时先搜索 KuiklyPolicy 获取现有用法，再写代码。
- 立即验证：每个文件迁移完成后运行可用编译命令，失败就修，不积累错误。

## 标准流程

1. 读取 Vue 源码、样式、依赖组件、路由参数、请求、存储和第三方调用。
2. 搜索目标 Kuikly 项目中相似页面/组件/模块用法，优先复用已有模式。
3. 若迁移多个文件，先输出 Migration Tier，按依赖从低到高迁移。
4. 按文件类型生成 Kuikly 文件：
   - 页面 `.vue`：`Xxx.kt` + `PageUI.kt`，页面类继承 `BasePager`。
   - 组件 `.vue`：单个 `Xxx.kt`，继承 `ComposeView<XxxAttr, XxxEvent>`。
   - 脚本 `.js/.ts`：迁移为数据模型、工具类或项目已有工具调用。
5. 先迁移状态/props/事件/生命周期/methods，再迁移 template 和 style。
6. 对请求使用 `ReqConfig.kt` 中的常量，禁止把 API key 写成字符串字面量。
7. 对原生能力优先使用项目已有 Module 或全局扩展。
8. 编译验证并执行审计清单。

## 项目硬约束

- 页面文件名：`lucky_draw_machine.vue -> LuckyDrawMachine.kt + PageUI.kt`；不要生成 `LuckyDrawMachinePage.kt` 或 `LuckyDrawMachinePageUI.kt`。
- 页面类继承 `BasePager` 时使用 `override fun buildBody(): ViewBuilder = buildUI(this)`；组件才使用 `override fun body()`。
- 页面 UI 全部写入同目录 `PageUI.kt` 的 `fun buildUI(page: Pager): ViewBuilder`；不要在页面类里写 UI。
- 尺寸必须使用 `com.tencent.kuiklypolycity.style.px`，如 `width(149f.px)`；例外是 `flex(1f)`、`opacity(0.5f)`、`zIndex(10)`、`lines(2)`、`pagerData.pageViewWidth`、`pagerData.statusBarHeight` 等已是像素或比例的值。
- `750rpx` 表示屏幕满宽，迁移为 `pagerData.pageViewWidth`，不要写 `375f.px`。
- 样式必须用函数调用语法：`width(100f.px)`，不要写 `width = 100f.px`。
- 颜色使用 `Color.WHITE` 或 `Color(0xFFFFFFFF)`，不要写字符串颜色或 Android `Color.parseColor()`。
- 禁止 `import kotlinx.coroutines`；使用项目/Kuikly 已有协程 import，并参考项目内现有文件。
- 类属性里实例化自定义对象要用 `by lazy`，避免 iOS JS 模式初始化问题。
- `observableList` 批量更新要先收集临时数组，再 `clear()` + `addAll()`，不要循环中逐个 `add`。
- `vfor` / `vforIndex` / `vforLazy` 闭包内必须只有一个根节点。
- List 内不要直接使用普通 `vfor`；优先参考项目现有 `vforIndex` / `vforLazy` 写法。
- **`vforLazy` 只能在 `List { }` 内部使用**（它是 `ListView` 的扩展函数）；在普通 `View`、`Scroller`、`vif` 块等非 List 容器中循环渲染子视图，必须改用 Kotlin 原生 `forEach`，例如 `ctx.list.forEach { item -> View { ... } }`。
- **`vforIndex` 的第一个参数必须是 `ObservableList<T>`**，不能传 `Int` 数量；如需按数量循环，先把数据转为 `observableList`，或改用 `forEach`。
- `Text` 组件不支持 `alignItemsCenter()` / `padding*()` / `flexDirection*()`；文本居中用 `textAlignCenter()`，其它布局需求由外层 `View` 提供。
- 叶子组件（`Text`/`Image`/`Input` 等）不支持 `padding*()`；需要内边距时用 `margin*()` 或包一层 `View`。
- 涉及 `isIosForLiteSDK3` / `isAndroidForLiteSDK3` 等历史平台兼容代码一律跳过并写注释说明，不做迁移。
- 协程与 JSON 类必须使用 Kuikly 版本：`com.tencent.kuikly.core.coroutines.*`、`com.tencent.kuikly.core.nvi.serialization.json.JSONObject`，禁止用 `kotlinx.coroutines` / `org.json`。
- 定时器使用 `com.tencent.kuikly.core.timer.Timer`、`by lazy` 声明；页面 `pageWillDestroy()` / 组件 `viewDestroyed()` 必须 `cancel()`。
- 事件监听类 Module（用于替代 Vue 的 `EventBus`）：注册的监听句柄在页面/组件销毁时必须显式反注册，防止重复回调和内存泄露；具体 API 以项目内实际封装为准，先搜索再使用。
- 调用 `suspend` 方法必须在 `GlobalScope.launch { ... }`（Kuikly 版）里；禁止 `runBlocking`，禁止在 `attr { ... }` 同步分支里调 suspend；点击等回调里也要用 `launch` 包一层。

## 页面模板

```kotlin
@Page("page_identifier")
internal class Example : BasePager() {
    // 标记来源 example.vue data: title: ""
    var title by observable(ObservableThreadSafetyMode.NONE, "")

    // 标记来源 example.vue created() { this.loadData() }
    override fun created() {
        super.created()
        loadData()
    }

    // 标记来源 example.vue methods: loadData() { ... }
    fun loadData() {
        // 业务逻辑
    }

    override fun buildBody(): ViewBuilder = buildUI(this)
}
```

```kotlin
fun buildUI(page: Pager): ViewBuilder {
    val ctx = page as Example
    return {
        // 标记来源 example.vue template: <div class="page">
        View {
            attr {
                width(ctx.pagerData.pageViewWidth) // 标记来源 example.vue style: width: 750rpx
                flexDirectionColumn()
                backgroundColor(Color.WHITE)
            }
        }
    }
}
```

## 组件模板

```kotlin
internal class ExampleCard : ComposeView<ExampleCardAttr, ExampleCardEvent>() {
    override fun createAttr() = ExampleCardAttr()
    override fun createEvent() = ExampleCardEvent()

    override fun body(): ViewBuilder {
        val ctx = this
        return {
            // 标记来源 example_card.vue template: <div @click="handleClick">
            View {
                attr {
                    width(100f.px)
                    height(50f.px)
                }
                event {
                    click { ctx.event.onClick?.invoke() }
                }
            }
        }
    }
}

internal class ExampleCardAttr : ComposeAttr() {
    // 标记来源 example_card.vue props: title
    var title by observable(ObservableThreadSafetyMode.NONE, "")
}

internal class ExampleCardEvent : ComposeEvent() {
    // 标记来源 example_card.vue this.$emit("click")
    var onClick: (() -> Unit)? = null
}
```

## 迁移速查

> 使用说明：
> - 表格上半部分（`<div>` / `<span>` / `v-if` / `setInterval` / 协程 / 请求等）属于 **Kuikly 框架内置能力**，可直接按右列写法使用。
> - 表格下半部分从**事件总线**开始属于**业务侧原生能力**（存储、账号、环境、广告、游戏、上报、分享等）——**Kuikly 框架本身不提供**这些能力，全部依赖各业务自行封装的 Module；右列**只列出 Vue 源符号作为识别参考**，Kuikly 侧的类名、方法名、参数**必须先在目标项目中搜索业务已有 Module 或全局扩展**（搜索关键词可参考各行说明），复用已有能力；确实缺失时再按 `references/module-rules.md` 的规范新建 Module，切勿凭命名习惯猜测符号是否存在（例如不要因为 Vue 用 `lite.kv` 就以为 Kuikly 侧一定有 `Storage` 类）。

| Vue | KuiklyPolyCity |
| --- | --- |
| `<div>` | `View` |
| `<span>` / `<p>` | `Text` |
| `<img>` | `Image` |
| `<input>` | `Input` |
| `<textarea>` | `TextArea` |
| `<swiper>` | `SliderPage`（`isHorizontal`、`pageItemWidth/Height`、`loopPlayIntervalTimeMs`、`initSliderItems`、`pageIndexDidChanged`） |
| 混合样式的 `<span>` / `<p>` | `RichText { attr {...}; Span { text(...); ... } }`，多行需 `lines(N)` |
| Lottie/PAG 动画 | `PAG { attr { src(...); repeatCount(N); autoPlay(true) } }` |
| `<list>` + 下拉刷新 + 触底加载 | `List { Refresh { ... }; vforLazy { ... }; FooterRefresh { ... } }` |
| `v-if` | `vif({ condition }) { ... }` |
| `v-for` | 参考场景使用 `vforIndex` / `vforLazy` |
| `watch: { data(nv, ov) { ... } }` | `PagerManager.getCurrentReactiveObserver().bindValueChange(valueBlock = { attr.data }, byOwner = this) { ... }` |
| `async function foo() { await bar() }` | 普通 `fun foo()` 内 `GlobalScope.launch { bar() }`（`bar` 声明为 `suspend`） |
| `await xxx()` | `launch { ... }` 内直接调用；回调式 API 用 `suspendCoroutine { cont -> xxx { cont.resume(it) } }` 包一层 |
| `Promise.all([a(), b()])` | `listOf(async { a() }, async { b() }).awaitAll()` |
| `setInterval` / `setTimeout` | `Timer().schedule(delay, period) { ... }`，销毁时 `cancel()` |
| 事件总线（如 `comm.EventBus.$emit/$on/$off`） | 先在目标项目中查找已有的通知/事件桥接 Module 或全局扩展；找不到再新建 Module，切勿直接假设 `notifyModule` 之类的具体符号 |
| `@click="method"` | `event { click { ctx.method() } }` |
| `this.$emit("hide")` | `event.onHide?.invoke()` |
| `data()` 基础值 | `observable(ObservableThreadSafetyMode.NONE, value)` |
| `data()` 数组 | `observableList<T>(ObservableThreadSafetyMode.NONE)` |
| `routeEnter` / `to.query.id` | `pagerData.params.optString("id", "")` |
| `comm.smartFetch("KEY")` | `http.smartFetch(KEY, param = param)`，`KEY` 来自 `ReqConfig.kt` |
| `this.$http.get + res 校验` | `http.smartFetchAndCheckRes(KEY, param, useCache = true)` |
| 本地存储（如 `lite.kv.setItem/getItem`） | **Kuikly 框架不提供内置存储 API**，必须先在目标项目中搜索业务已有的存储封装（关键字：`kv`、`Storage`、`Cache`、`setItem`、`getItem`、`setObject`、`getObject`、`StorageModule` 等；这些只是可能的业务命名，不一定存在），复用已有 API；若确实没有再按 Module 规范新建，禁止凭空写 `Storage.setStorage(...)` 之类的猜测调用 |
| 账号/用户信息（如 `comm.getSelfUm()`、`getSelfUin`） | 先搜索项目已有的账号信息 Module 或全局扩展；找不到再按项目 Module 规范新建，不要直接写死 `appInfo.getSelfUin()` |
| 运行环境（如 `comm.getEnv()`） | 先搜索项目已有的环境判断能力，复用现有 API；缺失时再补充 Module 方法，不要直接写死 `appInfo.env()` |
| 广告能力（如 `gdtAd.openRewardAD`） | 先搜索项目是否已有广告 Module / 全局扩展；有则复用，无则新建对应 Module；禁止凭猜写 `gGDTADModule.xxx` |
| 游戏信息（如 `game.getGameModel`） | 先搜索项目已有的游戏信息获取能力（可能通过通用业务对象 Module 提供），按项目实际 API 迁移；找不到再新建 |
| 其它第三方/JSAPI 调用（分享、图片浏览、评论、动画、认证、上报等） | 一律**先搜索目标项目**中同能力的 Module 或工具类，参考实际方法签名后再迁移；项目内确实缺失时再按 Module 规范新建，切勿凭命名习惯猜测方法名 |

## 审计清单

- 页面文件是否是 `Xxx.kt + PageUI.kt`，页面类是否使用 `buildBody()`。
- 所有 Vue 源码元素是否迁移，且没有新增 Vue 源码外内容。
- 所有组件创建是否来自 template 中真实标签、import 和 components 注册。
- 所有 props/Event 是否只来自组件自身 `props` 和 `$emit`。
- 尺寸是否有 `.px`，`750rpx`、状态栏高度、页面宽度是否特殊处理。
- API 是否使用 `ReqConfig.kt` 常量。
- 原生能力（存储、账号、环境、分享、广告、上报、事件总线、时间等）是否**优先搜索项目已有 Module / 工具类并复用**，而不是凭空假设符号存在；缺失时是否按项目 Module 规范新建。
- 时间相关调用是否使用项目内的日期工具，禁止 `System.currentTimeMillis()` 及 `java.util.Date` 等 JVM API。
- 分享等 Module 调用参数类型是否与项目实际方法签名一致（例如是否为 `Map<String, Any?>` 或 `JSONObject`，以搜索到的实际签名为准）。
- 角色绑定、信用分、广告、游戏信息等 suspend/回调调用是否按项目现有写法处理。
- `observableList` 是否批量 `addAll()`。
- 编译命令是否运行并通过。
