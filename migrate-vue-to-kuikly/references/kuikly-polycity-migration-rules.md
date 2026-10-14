# KuiklyPolyCity 迁移规则

## 项目结构

目标包路径通常为：

```text
shared/src/commonMain/kotlin/com/tencent/kuiklypolycity/
├── base/
├── base_components/
├── base_data/
├── component/
├── page/
├── style/
└── utils/
```

页面目录模式：

```text
page/page_name/
├── Xxx.kt
├── PageUI.kt
├── component/
└── data/
```

## 命名

- 页面逻辑文件：`snake_case.vue -> PascalCase.kt`，不要加 `Page` 后缀。
- 页面 UI 文件：固定 `PageUI.kt`。
- 页面类：`internal class LuckyDrawMachine : BasePager()`。
- 组件文件：`snake_case.vue -> PascalCase.kt`。
- 方法名：`snake_case -> camelCase`。
- 包路径：`@/page/... -> com.tencent.kuiklypolycity.page...`。

## 来源注释

使用中文标记，便于和现有 agents 保持一致：

```kotlin
// 标记来源 lucky_draw_machine.vue data: title: ""
var title by observable(ObservableThreadSafetyMode.NONE, "")

// 标记来源 lucky_draw_machine.vue methods: doTask(item) { ... }
fun doTask(item: JSONObject) { }

// 特殊标记引用的第三方调用源码：gdtAd.openRewardAD({ ... }, callback)
<业务侧广告 Module>.openRewardAD(adParams) { result -> }
```

> 上例中 `<业务侧广告 Module>` 只是占位说明。真实调用符号（模块名、方法签名、参数结构）必须先在当前业务工程内搜索确认；本文档不假设任何具体命名。

注释重点覆盖 data、props、computed、watch、methods、生命周期、template 结构、关键 style、事件、请求、存储和第三方调用。

## 状态

基础值：

```kotlin
// 标记来源 example.vue data: count: 0
var count by observable(ObservableThreadSafetyMode.NONE, 0)
```

数组：

```kotlin
// 标记来源 example.vue data: list: []
var list by observableList<JSONObject>(ObservableThreadSafetyMode.NONE)
```

静态值不要用 `observable`：

```kotlin
val leftImage = "${imageUrl}/weexNavBackButton.png"
companion object {
    const val DEFAULT_TIMEOUT = 5000L
}
```

`observableList` 更新：

```kotlin
dataList.clear()
val tempList = mutableListOf<JSONObject>()
for (i in 0 until array.length()) {
    array.optJSONObject(i)?.let { tempList.add(it) }
}
dataList.addAll(tempList)
```

## Vue watch 迁移

Vue 的 `watch: { xxx(newValue, oldValue) { ... } }` 迁移为 `PagerManager.getCurrentReactiveObserver().bindValueChange`，需要在组件/页面自身的 `created()` 中注册：

```kotlin
override fun created() {
    super.created()
    // 标记来源 xxx.vue watch: data: async function (newValue, oldValue) { ... }
    PagerManager.getCurrentReactiveObserver().bindValueChange(
        valueBlock = { attr.data },   // 要监听的响应式表达式
        byOwner = this                // 绑定生命周期，销毁时自动解绑
    ) { value ->
        processDataChange(value as? JSONObject)
    }
}
```

要点：

- `valueBlock` 里只放响应式读取；不要在里面做副作用。
- `byOwner = this` 让监听随组件销毁自动清理，不需要手动 remove。
- 监听 props 用 `attr.xxx`；监听自身 `data` 直接用属性名。

## 生命周期

| Vue | Kuikly Page | Kuikly Component |
| --- | --- | --- |
| `created` | `override fun created()` | `override fun created()` |
| `mounted` | 若 Vue methods 中需要保持语义，可保留 `fun mounted()` 并在合适处调用 | `override fun viewDidLoad()` |
| `show` | `override fun pageDidAppear()` | View `didAppear` |
| `hide` | `override fun pageDidDisappear()` | View `didDisappear` |
| `destroyed` | `override fun pageWillDestroy()` 或项目现有销毁方法 | `override fun viewDestroyed()` |
| `routeEnter` | `created()` 中读 `pagerData.params` | 不适用 |

页面类使用：

```kotlin
override fun buildBody(): ViewBuilder = buildUI(this)
```

组件类使用：

```kotlin
override fun body(): ViewBuilder { ... }
```

## 组件创建规则

创建组件前必须同时确认：

1. Vue template 中有 `<component-name>` 标签。
2. Vue import 中导入了该组件。
3. Vue `components` 注册了该组件。

只看到 `isShowXxx`、`showXxx` 这类 data 布尔值，不代表可以创建 `Xxx` 组件。

组件 `Attr` 只迁移组件自身 `props`，不要迁移外部调用传入但组件未定义的属性。组件 `Event` 只迁移组件自身 `$emit`，没有 `$emit` 就保留空 Event 类。

### 组件对外扩展函数（可选）

若组件跨包被调用、或需要保持和项目现有组件一致的调用风格，可在同文件末尾追加扩展函数：

```kotlin
internal fun ViewContainer<*, *>.MyCard(init: MyCard.() -> Unit) {
    addChild(MyCard(), init)
}
```

无此扩展函数时，直接以 `MyCard { ... }` 方式在同包内也能使用；先搜索项目中同类组件是否已按这种风格暴露。

### 组件曝光上报模式

Vue 中 `mounted` 里做曝光上报的写法，迁移到 Kuikly 时应写在**根节点的 `didAppear`** 事件里，用一个布尔位防止重复：

```kotlin
private var hasExposed = false

override fun body(): ViewBuilder {
    val ctx = this
    return {
        View {
            attr { /* 布局 */ }
            event {
                didAppear {
                    if (!ctx.hasExposed) {
                        ctx.hasExposed = true
                        // 调用业务侧已有的曝光/点击上报方法
                        // ⚠️ 具体方法签名请先在当前业务工程内搜索现有上报封装，不要凭方法名猜写参数
                        <业务上报调用>("eventId", "pageId", biz, actId)
                    }
                }
                didDisappear { /* 需要则做清理 */ }
            }
        }
    }
}
```

## 样式

必须导入：

```kotlin
import com.tencent.kuiklypolycity.style.px
```

单位转换：

| Vue/CSS | Kuikly |
| --- | --- |
| `80rpx` | `40f.px` |
| `60px` | `60f.px` |
| `750rpx` | `pagerData.pageViewWidth` |
| `width: 100%` | 视上下文为 `flex(1f)` 或 `pagerData.pageViewWidth` |

例外：

- `flex(1f)`
- `opacity(0.5f)`
- `zIndex(10)`
- `lines(2)`
- `pagerData.pageViewWidth`
- `pagerData.statusBarHeight`

导航栏高度：

```kotlin
height(pagerData.statusBarHeight + 44f.px)
```

不要对 `pagerData.statusBarHeight` 再加 `.px`，也不要除以 2。

## 样式 DSL

正确：

```kotlin
View {
    attr {
        width(100f.px)
        height(50f.px)
        backgroundColor(Color.WHITE)
        borderRadius(8f.px)
        flexDirectionRow()
        alignItemsCenter()
    }
}
```

错误：

```kotlin
View {
    attr {
        width = 100f.px
        backgroundColor = "white"
        display = "flex"
    }
}
```

颜色：

```kotlin
backgroundColor(Color.WHITE)
backgroundColor(Color(0xFFFFFFFF))
color(Color(0xFF333333))
```

### 叶子组件 padding 陷阱

`Text`、`Image`、`Input` 等叶子组件**不支持 `padding*()`**，写了会编译报 `Unresolved reference`。要实现内边距，两种做法：

- 用 `margin*()` 替代（简单场景）。
- 外层包一个 `View` 负责 `padding`，叶子组件放在里面。

### 常用样式补齐

```kotlin
// 背景图
backgroundImage("https://example.com/bg.jpg") { resizeCover() }

// 边框
border(Border(1f.px, BorderStyle.SOLID, Color(0xFFE5E5E5)))

// 阴影：offsetX, offsetY, blur, color
boxShadow(0f, 2f.px, 4f.px, Color(0x1A000000))

// 显示/隐藏（保留布局占位）
visibility(isVisible)

// 字体
Text { attr { fontFamily("TTTGB"); fontWeightBold() } }

// 一次性设置绝对定位
absolutePosition(top = 0f.px, left = 0f.px, right = 0f.px, bottom = 0f.px)
```

## Vue CSS → Kuikly 样式映射

| Vue / CSS | Kuikly |
| --- | --- |
| `display: flex; align-items: center; justify-content: center;` | `allCenter()` |
| `align-items: center;` | `alignItemsCenter()` |
| `justify-content: center;` | `justifyContentCenter()` |
| `align-self: stretch;` | `alignSelfStretch()` |
| `flex-direction: row;` | `flexDirectionRow()` |
| `flex-direction: column;` | `flexDirectionColumn()` |
| `position: absolute; right: 15px; top: 28px;` | `absolutePosition(right = 15f.px, top = 28f.px)` |
| `background: linear-gradient(to right, #FFE400, #C1EE4B);` | `backgroundLinearGradient(Direction.TO_RIGHT, ColorStop(Color(0xFFFFE400), 0f), ColorStop(Color(0xFFC1EE4B), 1f))` |
| `border-radius: 8px;` | `borderRadius(8f.px)` |
| `opacity: 0.5;` | `opacity(0.5f)` |
| `z-index: 10;` | `zIndex(10)` |
| `overflow: hidden;` + 省略号 | `lines(N)` + `overflow(true)` |

## Text vs View 属性差异

Kuikly 的 `Text` 组件与 `View` 组件属性并不完全一致，把 View 的属性写到 Text 上会直接编译报 `Unresolved reference`。

| 需求 | View（容器） | Text（文本） |
| --- | --- | --- |
| 水平居中 | `alignItemsCenter()` | `textAlignCenter()` |
| 内边距 | `padding(...)` / `paddingLeft(...)` | 用 `margin*` 或外层 `View` 包裹 |
| 外边距 | `margin*(...)` | `margin*(...)` |
| 排列方向 | `flexDirectionRow()` / `flexDirectionColumn()` | 不支持，由外层 View 决定 |

给一段文字加“背景 + 居中 + 圆角”时，正确做法是外层 `View` 负责布局与背景，内层 `Text` 只负责文本属性。

## RichText 富文本

多段样式混排必须使用 `RichText` + `Span`，不要用多个 `Text` 拼接。

```kotlin
RichText {
    attr {
        fontSize(14f.px)
        color(Color(0xFF333333))
        lines(0) // 0 表示不限制行数；多行同样需要显式设置
    }
    Span {
        text("7 日内都以该角色领取")
        fontWeight500()
        color(Color(0xFF261E1B))
    }
    Span {
        text(" 可在上方游戏标签中修改绑定角色")
        fontSize(12f.px)
        color(Color(0xFF999999))
    }
}
```

要点：

- `RichText.attr` 内的 `fontSize` / `color` / `lines` / `textAlignCenter()` / `overflow(true)` 作为默认样式和整体控制。
- 每个 `Span` 只写文本级样式：`text`、`fontSize`、`color`、`fontWeight400/500/600/Bold()`。
- 富文本中夹图（emoji、勋章等）时，直接在 `RichText { ... }` 内穿插 `Image { ... }` 节点。
- 多行富文本必须显式设置 `lines(N)`，未设置时默认单行。

## Vue Swiper → Kuikly SliderPage

Vue 的 `<swiper>` 迁移为 `com.tencent.kuikly.core.views.compose.SliderPage`。

```kotlin
SliderPage {
    attr {
        isHorizontal = true                        // <swiper :vertical="false">
        pageItemWidth = ctx.pagerData.pageViewWidth
        pageItemHeight = 100f.px
        loopPlayIntervalTimeMs = 2000              // :autoplay + :interval="2000"

        initSliderItems(ctx.dataList.toList()) { item ->
            View {
                attr { flex(1f); allCenter() }
                Text { attr { text(item.optString("title", "")); fontSize(14f.px) } }
            }
        }
    }
    event {
        pageIndexDidChanged {
            ctx.currentIndex = (it as JSONObject).optInt("index")
        }
    }
}
```

| Vue Swiper 属性 | SliderPage 属性 |
| --- | --- |
| `:autoplay="true"` / `:interval="2000"` | `loopPlayIntervalTimeMs = 2000` |
| `:circular="true"` | 默认支持循环 |
| `:vertical="true"` | `isHorizontal = false` |
| `previous-margin` / `next-margin` | 通过 `pageItemWidth` 控制 |
| `@change` | `pageIndexDidChanged` |

## 条件、循环和列表

```kotlin
vif({ ctx.isVisible }) {
    View { }
}
velseif({ ctx.isLoading }) {
    Text { attr { text("Loading") } }
}
velse {
    Text { attr { text("Empty") } }
}
```

`vfor` / `vforIndex` / `vforLazy` 闭包必须只有一个根节点。多个条件分支或并列节点时先包一层 `View`。

List 内不要使用普通 `vfor`。优先搜索项目内 `List` + `vforIndex` 或 `vforLazy` 的现有写法。

### 下拉刷新 + 上拉加载完整组合

Vue 中滚动列表 + 下拉刷新 + 触底加载的组合，Kuikly 用 `List` + `Refresh` + `FooterRefresh` 表达：

```kotlin
List {
    attr { flex(1f); showScrollerIndicator(false) }

    // 下拉刷新头
    Refresh {
        attr { height(70f.px); allCenter() }
        event {
            refreshStateDidChange {
                if (it == RefreshViewState.REFRESHING) ctx.onRefresh()
            }
        }
    }

    // 列表数据
    vforLazy({ ctx.dataList }) { item, index, _ ->
        ItemView { attr { data = item; this.index = index } }
    }

    // 上拉加载更多
    FooterRefresh {
        attr { height(60f.px); allCenter() }
        event {
            refreshStateDidChange {
                if (it == FooterRefreshState.REFRESHING) ctx.loadMore()
            }
        }
    }

    event { scroll { ctx.handleScroll(it.offsetY) } }
}
```

### PAG 动画组件

Vue 中使用第三方动画（Lottie/PAG）迁移为 `PAG`：

```kotlin
PAG {
    ref { ctx.pagViewRef = it }
    attr {
        size(50f.px, 50f.px)
        src("https://example.com/animation.pag")
        repeatCount(3)          // 0 表示无限循环
        autoPlay(true)
    }
    event {
        animationStart { console.info("anim start") }
        animationEnd { console.info("anim end") }
        loadFailure { console.error("pag load fail: ${it.message}") }
    }
}
```

通过 `ref` 拿到的对象可在业务逻辑里手动 `play()` / `stop()`。

## API 和请求

API 常量在 `com.tencent.kuiklypolycity.utils.ReqConfig.kt`。禁止字符串字面量：

```kotlin
import com.tencent.kuiklypolycity.utils.SOLO_RAFFLE_RECORDS

val res = http.smartFetch(SOLO_RAFFLE_RECORDS, param = param)
```

不要写：

```kotlin
http.smartFetch("SOLO_RAFFLE_RECORDS", param = param)
http.smartFetch("app.solo_raffle.records", param = param)
```

迁移步骤：

1. 从 Vue 请求中识别 API key。
2. 在 `ReqConfig.kt` 搜索对应常量。
3. 添加 import。
4. 使用常量引用。

### smartFetchAndCheckRes 与缓存

真正下发到业务的推荐入口是 `http.smartFetchAndCheckRes`，它在 `smartFetch` 基础上做了 `succRes` 校验，并支持自动缓存：

```kotlin
private val http = Http()

private fun loadData() {
    GlobalScope.launch {
        try {
            val result = http.smartFetchAndCheckRes(
                urlKey = SOLO_RAFFLE_RECORDS,
                param = JSONObject().apply {
                    put("page", 1)
                    put("size", 10)
                },
                useCache = true   // 启用缓存
            )
            result?.let { processData(it) }
        } catch (e: Exception) {
            console.error("请求失败：${e.message}")
        }
    }
}
```

缓存策略：

- 启用 `useCache = true` 时，优先返回缓存，同时后台拉取最新数据更新缓存。
- 缓存 key 由框架自动生成，格式：`accountId-baseUrlWithPath-paramString`。
- 网络失败时自动回退到缓存。
- 实时性要求高的接口（余额、订单状态）显式 `useCache = false`。

### 批量请求

多个接口需要并发请求时，使用 `executeBatchRequestsAsync`：

```kotlin
val batch = listOf(
    Http.BatchRequestConfig(
        url = ACTIVITY_LIST,
        useCache = true
    ),
    Http.BatchRequestConfig(
        url = USER_PROFILE,
        param = JSONObject().apply { put("uin", uin) },
        useCache = true
    )
)
val results = http.executeBatchRequestsAsync(batch)
```

## 存储

Vue 中的 `lite.kv.setItem` / `lite.kv.getItem` 等本地存储 API，**在 Kuikly 侧并没有对应的框架内置能力**——Kuikly 框架本身不提供开箱即用的本地存储 API，所有本地存储都是**业务自定义的 Module**（类名可能是 `Storage`、`XxxKV`、`XxxStorage`、`XxxCache`、`xxxStorageModule` 等，`Storage` 也只是其中一种命名约定，并不天然存在）。迁移前必须以目标业务工程现有封装为准，禁止凭命名习惯猜测符号。

迁移步骤：

1. 在当前业务工程内搜索存储实现：
   - 关键词：`kv`、`Storage`、`Cache`、`setItem`、`getItem`、`setObject`、`getObject`、`StorageModule`。
   - 定位到 1~2 个真实调用点，抄它的 import、类名、方法签名、返回类型（同步 / suspend / 回调）。
2. 若业务已有存储封装：直接复用，一对一映射 Vue 的 `setItem/getItem/JSON.stringify/JSON.parse` 语义。
3. 若业务确认**没有**任何存储封装：按 [module-rules.md](./module-rules.md) 的 Module 规范新建一个业务侧存储 Module（继承 `BaseModule`，暴露 `setItem/getItem/setObject/getObject` 等方法），并同步补充全局扩展。
4. 迁移时保留 Vue 原调用注释：`// 标记来源 xxx.vue: lite.kv.setItem(...)`。

> 禁止在没有确认业务现有封装的前提下，直接写 `Storage.setStorage(...)` 或类似猜测性调用——`Storage` 类是否存在、方法叫什么，都必须以项目实际代码为准。

## Vue 异步 → Kuikly 协程

Vue 里的 `async function` / `await` / `Promise` / `.then()` **不能**直接翻译成同名 Kotlin API，必须走 Kuikly 协程。

### 必须使用的 import

```kotlin
import com.tencent.kuikly.core.coroutines.GlobalScope
import com.tencent.kuikly.core.coroutines.launch
import com.tencent.kuikly.core.coroutines.async
import com.tencent.kuikly.core.coroutines.awaitAll
```

禁止 `import kotlinx.coroutines.*`（多平台不可用）；禁止 `runBlocking`（会阻塞 Pager 线程导致白屏）。

### 常见范式对照

| Vue 写法 | Kuikly 写法 |
| --- | --- |
| `async function loadData() { ... }` | 普通 `fun loadData()`，方法体里再 `GlobalScope.launch { ... }` |
| `await fetchXxx()` | 在 `launch { ... }` 内直接调用 `fetchXxx()`（要求 `fetchXxx` 是 `suspend`） |
| `xxx().then(res => { ... })` | `launch { val res = xxx(); ... }`；仅回调式 API 才保留原回调形式 |
| `Promise.all([a(), b()])` | `val (ra, rb) = listOf(async { a() }, async { b() }).awaitAll()` |
| `try/catch` + `await` | Kotlin `try/catch`（`suspend` 抛异常会正常传播） |
| `finally` | Kotlin `finally` |
| `async created() { await ... }` | `override fun created() { super.created(); GlobalScope.launch { ... } }` |

### 页面 / 组件里在哪里启动协程

- **首选** `GlobalScope.launch { ... }`（这是 Kuikly 版 GlobalScope，页面销毁会自动清理）。
- 不要在 `attr { ... }` 或 `event { click { ... } }` 的**同步分支**里调用 `suspend` 方法；进入回调后要用 `launch` 包一层。
- 不需要手动创建 `CoroutineScope`；也不要 `MainScope() / SupervisorJob()`（`kotlinx.coroutines` 一律禁用）。

```kotlin
event {
    click {
        // ❌ 错误：click 是普通回调，直接写 checkCreditScore("...") 编译不过
        // ✅ 正确
        GlobalScope.launch {
            try {
                comm.checkCreditScore("抽奖机")
            } catch (e: Exception) {
                return@launch
            }
            doTask()
        }
    }
}
```

### 把回调式 Module 方法包成 suspend

回调式 API（例如 `gAppInfoModule.login { ... }`、`gEventModule.alert(...) { ... }`）在业务里被"串行等待"时，用 `suspendCoroutine` 一次包装即可，避免回调地狱：

```kotlin
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

private suspend fun loginAwait(): JSONObject? = suspendCoroutine { cont ->
    gAppInfoModule.login { result -> cont.resume(result) }
}

GlobalScope.launch {
    val loginResult = loginAwait()
    if (loginResult?.optInt("status") == 1) {
        val role = CommBind.getBindRole(bizCode)
        // ...
    }
}
```

项目里如果已有 `alertAwait`、`loginAwait` 等封装，优先复用，不要自己再包一份。

### 顺序 await 与并发 await

```kotlin
// 顺序（Vue: const a = await f1(); const b = await f2(a))
GlobalScope.launch {
    val a = fetchA()
    val b = fetchB(a)
    render(a, b)
}

// 并发（Vue: const [a, b] = await Promise.all([f1(), f2()])
GlobalScope.launch {
    val results = listOf(async { fetchA() }, async { fetchB() }).awaitAll()
    render(results[0], results[1])
}
```

### 常见错误

| 错误写法 | 正确写法 |
| --- | --- |
| `runBlocking { ... }` | 改为 `GlobalScope.launch { ... }` |
| 在 `fun onClick()` 里直接调用 suspend 方法 | 外层 `GlobalScope.launch { ... }` |
| `async { xxx }` 后不 `await`，指望它自动完成 | 要么用 `launch`，要么显式 `.await()` / `.awaitAll()` |
| suspend 里抛异常没 try-catch，导致整页崩 | 关键 suspend（`checkCreditScore`、`smartFetch`、`CommBind.*`）必须 try-catch |
| Vue 用 `Promise.race` | Kuikly 无对应，改为业务上取先返回的那一个 launch，或引入超时：`withTimeoutOrNull` |

## Timer 定时器

Vue 里的 `setInterval` / `setTimeout` 迁移为 Kuikly 的 `Timer`：

```kotlin
import com.tencent.kuikly.core.timer.Timer

private val timer by lazy { Timer() }

// 相当于 setTimeout(fn, 1000)
timer.schedule(delay = 1000, period = 0) {
    // 一次性回调
}

// 相当于 setInterval(fn, 1000)
timer.schedule(delay = 0, period = 1000) {
    // 周期回调
}

// 页面/组件销毁时务必清理
override fun pageWillDestroy() {
    super.pageWillDestroy()
    timer.cancel()
}
```

要点：

- `Timer` 属性一律 `by lazy`（避免 iOS JS 模式白屏）。
- 页面 `pageWillDestroy()` / 组件 `viewDestroyed()` 必须 `cancel()`；否则回调会在页面销毁后继续触发，出现 crash 或数据错乱。
- 不要使用 `kotlinx.coroutines.delay` 的循环去替代 Timer。

## 时间

禁止 `System.currentTimeMillis()` 与 `kotlinx.datetime` 直接调用。

Vue 中的 `comm.getCurrentInterval()`、`new Date()`、`getFullYear` / `getMonth` / `getDate` 等时间相关 API，**不要**直接假设某个统一的时间工具类（如 `CommDate` 或某扩展函数）一定存在——每个业务通常已有自己的时间工具封装，命名与单位（秒级 / 毫秒级）都不相同。

迁移步骤：

1. 在当前业务工程内搜索 Kuikly 侧的时间工具：
   - 关键词：`Date`、`CurrentTime`、`Interval`、`Timestamp`、`getFullYear`、`getMonth`、`getDate`。
   - 定位到 1~2 个真实调用点，抄它的类名、方法签名和返回单位（秒 vs. 毫秒）。
2. 若业务已有时间工具：一对一映射 Vue 原语义，特别注意毫秒 / 秒的换算。
3. 若业务**没有**统一时间工具：按 [module-rules.md](./module-rules.md) 新建业务侧工具或 Module，不要直接调用平台差异的 API。
4. `getMonth()` 类方法若沿用 JS 语义（返回 0-11），展示月份需 `+ 1`；换用了别的封装则按其实际语义处理。

> 禁止在没有确认业务现有封装的前提下，凭命名直接写 `CommDate.getCurrentTimeInMillis()` 等具体调用。

## 常见编译错误

| 错误 | 修复 |
| --- | --- |
| `Unresolved reference: GlobalScope` | 搜索项目现有 Kuikly 协程 import，不要用 `kotlinx.coroutines` |
| `Unresolved reference: JSONObject` | 使用 `com.tencent.kuikly.core.nvi.serialization.json.JSONObject` |
| `overrides nothing: body` in Page | 页面改为 `buildBody()` |
| `backgroundColor("#fff")` 类型错误 | 改为 `Color(0xFFFFFFFF)` |
| `Color.parseColor` 不存在 | 改为 `Color(0xFFxxxxxx)` |
| `textOverflowEllipsis` 不存在 | 搜索项目写法，通常 `lines(1)` + `overflow(true)` |
| `JSONObject.put` 重载歧义 | 必要时 `value as Any?` |
| `Unresolved reference: alignItemsCenter`（写在 Text 上） | 改用 `textAlignCenter()`，或将 Text 放进 View 由 View 做居中 |
| `Unresolved reference: onDestroyView` | 页面用 `pageWillDestroy()`，组件用 `viewDestroyed()` |
| `Color.parseColor("#333")` 不存在 | 改为 `Color(0xFF333333)` |

## 正确 import 路径

Kuikly 多平台代码不能使用 Kotlin/Android 标准库对应类，编译时会直接 `Unresolved reference`。以下 **框架层** import 必须使用 Kuikly 版本：

```kotlin
// 协程
import com.tencent.kuikly.core.coroutines.GlobalScope
import com.tencent.kuikly.core.coroutines.launch

// JSON
import com.tencent.kuikly.core.nvi.serialization.json.JSONObject
import com.tencent.kuikly.core.nvi.serialization.json.JSONArray
```

**业务侧样式扩展与 Module 扩展**（例如 `px`、`gXxxModule`、`appInfo` 等）不在本文列出固定清单——它们完全取决于当前业务工程的封装约定。使用步骤：

1. 先在当前业务工程内搜索现成的扩展/Module 名（关键词：`extension`、`Module`、`.px`、`g.*Module`）。
2. 找到后按业务现有 import 路径导入；不要凭猜测拼包名。
3. 若业务确认缺少所需扩展/Module：按 [module-rules.md](./module-rules.md) 新建，然后再统一在页面里导入。

## 无用平台兼容代码跳过

Vue 源码中出现下列历史遗留代码时，直接跳过迁移，并在原位置写注释说明：

- `comm?.isIosForLiteSDK3()` / `comm?.isAndroidForLiteSDK3()`
- `self.isIosForLiteSDK3 = comm?.isIosForLiteSDK3()` 及相关赋值
- 基于 `isIosForLiteSDK3` / `isAndroidForLiteSDK3` 的 `v-if` 判断

处理方式：

```kotlin
override fun created() {
    super.created()
    // 跳过无用代码：self.isIosForLiteSDK3 = comm?.isIosForLiteSDK3()
    // Kuikly 中不需要此类平台兼容判断
}
```

## 导航栏高度

Vue 中 `navHeight + statusHeight` 的公式统一转为：

```kotlin
height(pagerData.statusBarHeight + 44f.px)
```

- `pagerData.statusBarHeight` 已是像素值，**不要**再加 `.px`。
- 44 是导航栏固定 pt 值，必须写成 `44f.px`。
- 不要用 `pagerData.navigationBarHeight`（可能不准）；不要除以 2。

## 编译验证

按项目实际可用命令优先。常见命令：

```bash
./gradlew :shared:compileKotlinIosArm64
./gradlew :shared:packLocalJSBundleRelease
./gradlew :kuikly-dynamic-apk-builder:packSplitApkRelease
```

若改动涉及 KuiklyPolyCity APK 构建链，优先运行：

```bash
./gradlew :kuikly-dynamic-apk-builder:packSplitApkRelease
```
