# Kuikly 代码架构规范（KuiklyPolyCity 项目示例代码）

> 本示例对应 Vue3 → KuiklyPolyCity 的目标工程约定（包名 `com.tencent.kuiklypolycity`）。与 Template 工程的纯 `body()` 风格不同，PolyCity 页面使用 `buildBody()` + 独立 `PageUI.kt`，组件使用 `body()`。

## 1 文件结构规范

```
页面名/
├── Xxx.kt                 # 页面逻辑（继承 BasePager，含 buildBody）
├── PageUI.kt             # 页面 UI（buildUI 方法）
├── component/            # 组合组件目录
│   └── XxxCard.kt        # 组件（继承 ComposeView）
├── data/                 # 数据模型目录
│   └── XxxItem.kt
└── XxxViewModel.kt       # 状态/逻辑（可选）
```

### 文件职责划分

| 文件类型 | 职责 | 不应包含 |
|---------|------|--------|
| **Xxx.kt**（页面） | 状态声明、生命周期、事件处理、业务方法 | 复杂 UI 代码（放 PageUI.kt） |
| **PageUI.kt** | 页面 UI 渲染（buildUI） | 网络请求、复杂数据处理 |
| **ComposeView** | 可复用 UI 组件、Attr/Event 定义 | 直接网络请求、全局状态 |
| **Models** | 数据类型、JSON 编解码 | 业务逻辑 |

---

## 2 页面入口（Xxx.kt + PageUI.kt）

```kotlin
package com.tencent.kuiklypolycity.page.xxx

import com.tencent.kuikly.core.annotations.Page
import com.tencent.kuikly.core.base.*
import com.tencent.kuikly.core.directives.vif
import com.tencent.kuikly.core.directives.vforIndex
import com.tencent.kuikly.core.nvi.serialization.json.JSONObject
import com.tencent.kuikly.core.reactive.handler.observable
import com.tencent.kuikly.core.reactive.handler.observableList
import com.tencent.kuikly.core.reactive.handler.ObservableThreadSafetyMode
import com.tencent.kuikly.core.views.*
import com.tencent.kuiklypolycity.base.BasePager
import com.tencent.kuiklypolycity.style.px

@Page("page_identifier")
internal class ExamplePage : BasePager() {

    // ── 响应式状态（对应 Vue ref/reactive/data）──
    var title by observable(ObservableThreadSafetyMode.NONE, "")
    var dataList by observableList<JSONObject>(ObservableThreadSafetyMode.NONE)

    // ── 生命周期：页面创建（对应 Vue created/onMounted）──
    override fun created() {
        super.created()
        loadData()
    }

    // ── 生命周期：页面销毁，清理 Timer/事件监听 ──
    override fun pageWillDestroy() {
        super.pageWillDestroy()
        // timer.cancel(); module.unregister(...)
    }

    // ── UI 渲染入口：页面必须用 buildBody 委派给 PageUI ──
    override fun buildBody(): ViewBuilder = buildUI(this)

    // ── 业务方法 ──
    private fun loadData() {
        GlobalScope.launch {
            try {
                val result = http.smartFetchAndCheckRes(
                    urlKey = SOME_API_KEY,   // 来自 ReqConfig.kt
                    param = JSONObject().apply { put("page", 1) }
                )
                result?.let { processData(it) }
            } catch (e: Exception) {
                console.error("请求失败：${e.message}")
            }
        }
    }
}
```

```kotlin
package com.tencent.kuiklypolycity.page.xxx

import com.tencent.kuikly.core.base.Pager
import com.tencent.kuikly.core.base.ViewBuilder
import com.tencent.kuikly.core.views.*
import com.tencent.kuiklypolycity.style.px

fun buildUI(page: Pager): ViewBuilder {
    val ctx = page as ExamplePage
    return {
        attr {
            width(ctx.pagerData.pageViewWidth)
            flexDirectionColumn()
            backgroundColor(Color.WHITE)
        }

        // 条件渲染：对应 v-if
        vif({ ctx.title.isNotEmpty() }) {
            Text {
                attr {
                    text(ctx.title)
                    fontSize(17f.px)
                    color(Color(0xFF333333))
                }
            }
        }

        // 列表渲染：对应 v-for（List 内用 vforIndex）
        List {
            attr { flex(1f); showScrollerIndicator(false) }
            vforIndex({ ctx.dataList }) { item, index, _ ->
                View {
                    attr { height(50f.px); flexDirectionRow(); alignItemsCenter() }
                    Text {
                        attr { text(item.optString("title", "")); fontSize(15f.px) }
                    }
                }
            }
        }
    }
}
```

---

## 3 组合组件（ComposeView）

```kotlin
package com.tencent.kuiklypolycity.page.xxx.component

import com.tencent.kuikly.core.base.ComposeView
import com.tencent.kuikly.core.base.ComposeAttr
import com.tencent.kuikly.core.base.ComposeEvent
import com.tencent.kuikly.core.reactive.handler.observable
import com.tencent.kuikly.core.reactive.handler.ObservableThreadSafetyMode
import com.tencent.kuikly.core.views.*
import com.tencent.kuiklypolycity.style.px

internal class ExampleCard : ComposeView<ExampleCardAttr, ExampleCardEvent>() {
    override fun createAttr() = ExampleCardAttr()
    override fun createEvent() = ExampleCardEvent()

    override fun body(): ViewBuilder {
        val ctx = this
        return {
            View {
                attr { flexDirectionRow(); alignItemsCenter(); padding(10f.px) }
                Image {
                    attr { size(40f.px, 40f.px); borderRadius(20f.px); src(ctx.attr.imageUrl) }
                }
                Text {
                    attr { text(ctx.attr.title); fontSize(15f.px); marginLeft(10f.px); flex(1f) }
                }
            }
        }
    }
}

internal class ExampleCardAttr : ComposeAttr() {
    var title by observable(ObservableThreadSafetyMode.NONE, "")
    var imageUrl by observable(ObservableThreadSafetyMode.NONE, "")
}

internal class ExampleCardEvent : ComposeEvent() {
    var onClick: (() -> Unit)? = null
}

// 跨包调用时的扩展函数（可选）
internal fun ViewContainer<*, *>.ExampleCard(init: ExampleCard.() -> Unit) {
    addChild(ExampleCard(), init)
}
```

---

## 4 数据模型（Model）

```kotlin
package com.tencent.kuiklypolycity.page.xxx.data

import com.tencent.kuikly.core.nvi.serialization.json.JSONObject
import com.tencent.kuikly.core.reactive.handler.observable
import com.tencent.kuikly.core.reactive.handler.ObservableThreadSafetyMode

internal class XxxItem {
    var id: Long = 0
    var title: String = ""
    var cover: String = ""

    // 响应式（驱动 UI 更新）
    var isSelected by observable<Boolean>(ObservableThreadSafetyMode.NONE, false)

    fun decode(data: JSONObject): XxxItem {
        title = data.optString("title")
        id = data.optLong("id")
        cover = data.optString("cover")
        return this
    }
}

// observableList 批量更新（禁止循环中逐个 add）
fun refreshList(target: ObservableList<JSONObject>, array: org.json.JSONArray) {
    target.clear()
    val temp = mutableListOf<JSONObject>()
    for (i in 0 until array.length()) {
        array.optJSONObject(i)?.let { temp.add(it) }
    }
    target.addAll(temp)
}
```

---

## 5 网络请求（ReqConfig）

```kotlin
import com.tencent.kuiklypolycity.utils.SOLO_RAFFLE_RECORDS   // 来自 ReqConfig.kt 常量
import com.tencent.kuikly.core.coroutines.GlobalScope
import com.tencent.kuikly.core.coroutines.launch

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
                useCache = true
            )
            result?.let { processData(it) }
        } catch (e: Exception) {
            console.error("请求失败：${e.message}")
        }
    }
}
```

---

## 6 Module 调用（业务侧原生能力）

> Kuikly 框架不提供存储/账号/环境/分享/上报等能力，全部依赖业务 Module。先搜索 `com.tencent.kuiklypolycity.utils.extension.gXxxModule`，复用已有全局扩展。

```kotlin
import com.tencent.kuiklypolycity.utils.extension.gEventModule
import com.tencent.kuiklypolycity.utils.extension.gShareModule
import com.tencent.kuiklypolycity.utils.extension.gAppInfoModule

// Toast / 弹窗
gEventModule.toast("提示信息")

// 分享
gShareModule.callShareNative(params, "1,2,3")

// 登录回调
gAppInfoModule.login { result ->
    val status = result?.optInt("status")
}
```

---

## 7 Import 路径汇总（KuiklyPolyCity）

```
// 框架核心
com.tencent.kuikly.core.annotations.Page
com.tencent.kuikly.core.base.Color / ViewBuilder / ViewRef / ViewContainer
com.tencent.kuikly.core.base.ComposeView / ComposeAttr / ComposeEvent
com.tencent.kuikly.core.base.Border / BorderStyle / Direction / ColorStop

// 指令
com.tencent.kuikly.core.directives.vif / velseif / velse / vfor / vforIndex / vforLazy / vbind

// 响应式
com.tencent.kuikly.core.reactive.handler.observable / observableList / ObservableThreadSafetyMode

// 协程 / JSON / Timer
com.tencent.kuikly.core.coroutines.GlobalScope / launch / async / awaitAll
com.tencent.kuikly.core.nvi.serialization.json.JSONObject / JSONArray
com.tencent.kuikly.core.timer.Timer

// PolyCity 业务基础
com.tencent.kuiklypolycity.base.BasePager
com.tencent.kuiklypolycity.style.px
com.tencent.kuiklypolycity.utils.ReqConfig
com.tencent.kuiklypolycity.utils.extension.gEventModule / gShareModule / gAppInfoModule
```
