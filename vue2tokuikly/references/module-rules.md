# Module 迁移规则（Vue → Kuikly）

> 本文档用于指导 Vue/Vue2 页面迁移到 KuiklyPolyCity 时的 Module 调用规则。

## 目录

- [1. 概述](#1-概述)
- [2. 架构设计](#2-架构设计)
- [3. 使用方式](#3-使用方式)
- [4. 最佳实践](#4-最佳实践)

---

## 1. 概述

KuiklyPolyCity 的 Module 系统用于桥接 Kotlin 多平台代码与 Android/iOS 原生能力，采用**桥接模式**实现平台解耦。Vue 项目迁移到 Kuikly 时，原本通过 `event.xxx`、`comm.xxx`、`gdtAd.xxx` 等 JS 全局对象调用的原生能力，需要一对一映射到对应的 Kuikly Module。

### 核心特性

- ✅ **统一接口**：所有 Module 继承自 `BaseModule`
- ✅ **同步/异步支持**：根据业务选择调用方式
- ✅ **类型安全**：Kotlin 编译期检查
- ✅ **扩展友好**：提供全局扩展函数（`gXxxModule`）
- ✅ **协程支持**：suspend 方法可在协程中调用

---

## 2. 架构设计

### 2.1 类继承结构

```
Module (Kuikly Core)
    ↓
BaseModule (项目基类)
    ↓
具体 Module 实现 (EventModule, AppInfoModule, ...)
```

### 2.2 BaseModule 核心方法

```kotlin
abstract class BaseModule : Module() {
    fun asyncCallNativeMethod(methodName: String, data: JSONObject?, callbackFn: CallbackFn?)
    fun syncCallNativeMethod(methodName: String, data: JSONObject?, callbackFn: CallbackFn?): String
}
```

### 2.3 Module 注册

所有 Module 通过 `registerExternalModules()` 统一注册，迁移时无需修改注册逻辑，直接使用即可。



---

## 3. 使用方式

### 3.1 推荐方式：全局扩展函数

使用前必须显式导入：

```kotlin
import com.tencent.kuiklypolycity.utils.extension.gEventModule
import com.tencent.kuiklypolycity.utils.extension.gShareModule
import com.tencent.kuiklypolycity.utils.extension.gAppInfoModule
import com.tencent.kuiklypolycity.utils.extension.gGDTADModule
import com.tencent.kuiklypolycity.utils.extension.appInfo
```

调用示例：

```kotlin
gEventModule.toast("提示信息")
gShareModule.callShareNative(params, "1,2,3,4,5,6")
gAppInfoModule.login { result -> /* 登录回调 */ }
```

### 3.2 通过 PagerManager 获取（备选）

```kotlin
val eventModule = PagerManager.getCurrentPager()
    .acquireModule<EventModule>(EventModule.MODULE_NAME)
eventModule.toast("操作成功")
```

### 3.3 在 BasePager 中使用

```kotlin
class MyPage : BasePager() {
    private val eventModule by lazy {
        acquireModule<EventModule>(EventModule.MODULE_NAME)
    }
}
```

---



## 4. 最佳实践

### 4.1 使用懒加载全局实例

```kotlin
// ✅ 推荐
gEventModule.toast("提示")

// ❌ 不推荐：每次都重新获取
PagerManager.getCurrentPager()
    .acquireModule<EventModule>(EventModule.MODULE_NAME)
    .toast("提示")
```

### 4.2 使用协程消除回调地狱

```kotlin
// ❌ 回调嵌套
gEventModule.alert("提示", "确认？") { r1 ->
    if (r1.optInt("index") == 1) {
        gAppInfoModule.login { r2 ->
            if (r2?.optInt("status") == 1) { /* ... */ }
        }
    }
}

// ✅ 协程
launch {
    val idx = gEventModule.alertAwait("提示", "确认？", listOf("取消", "确认"))
    if (idx == 1) {
        val loginResult = suspendCoroutine<JSONObject?> { cont ->
            gAppInfoModule.login { cont.resume(it) }
        }
        if (loginResult?.optInt("status") == 1) { /* ... */ }
    }
}
```

### 4.3 参数校验

```kotlin
fun openURL(url: String) {
    if (url.isEmpty()) return
    if (!url.startsWith("http") && !url.startsWith("app://")) return
    gEventModule.openURL(url)
}
```

### 4.4 统一错误处理

```kotlin
fun safeCall(action: () -> Unit) {
    try { action() } catch (e: Exception) {
        console.error("Module 调用异常：${e.message}")
        gEventModule.toast("操作失败，请稍后重试")
    }
}
```

### 4.5 关键操作添加日志

```kotlin
console.info("开始分享，参数：$params")
gShareModule.callShareNative(params, "1,2,3")
```

---

