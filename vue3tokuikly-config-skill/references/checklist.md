# Kuikly 代码规则检查（Vue3 → KuiklyPolyCity）

对生成的 Kuikly 代码逐文件进行以下规则检查，发现不符合的地方直接修正。这里定义了一些常见的幻觉代码检查规则。

## 基本规则

1. 所有类需要 `internal` 修饰符。
2. 不要使用示例代码和 Kuikly 文档中没出现过的语法，如 `slot` 等。
3. 包名使用 `com.tencent.kuiklypolycity` 开头。
4. 页面必须继承 `BasePager`（来自 `com.tencent.kuiklypolycity.base.BasePager`），用 `buildBody()` 委派 `PageUI.kt`。
5. 组件必须继承 `ComposeView`，用 `override fun body()`。
6. 通过 `gXxxModule` 全局扩展访问业务 Module，不实例化。

## 属性检查（常见幻觉）

| 错误写法 | 正确写法 |
|---------|---------|
| `paddingVertical` | 分别设置 `paddingTop` 和 `paddingBottom` |
| `paddingHorizontal` | 分别设置 `paddingLeft` 和 `paddingRight` |
| `marginVertical` | 分别设置 `marginTop` 和 `marginBottom` |
| `marginHorizontal` | 分别设置 `marginLeft` 和 `marginRight` |
| `borderStyle` / `borderWidth` / `borderColor` | 使用 `border(Border(...))` 替代 |
| `numberOfLines` | 使用 `lines(1)` 替代 |
| Text 中使用 `padding` | 改为 `margin` |
| `onPress` | 使用 `event` 中的 `click` 事件 |
| `fontWeight(400)` | 使用 `fontWeight400()` 等预定义方法 |
| Text 中使用 `alignItemsCenter` | 使用 `textAlignCenter()` |

### border 正确写法示例

```kotlin
border(
    Border(
        lineWidth = 2f,
        color = Color(0xFF23D3FD),
        lineStyle = BorderStyle.SOLID
    )
)
```

## 尺寸与样式

- 尺寸必须带 `com.tencent.kuiklypolycity.style.px`，如 `width(100f.px)`。
- `750rpx` 迁移为 `pagerData.pageViewWidth`，不要写 `375f.px`。
- 颜色使用 `Color.WHITE` 或 `Color(0xFF333333)`，不要字符串颜色或 `Color.parseColor()`。
- 样式使用函数调用语法 `width(100f.px)`，不要 `width = 100f.px`。

## 页面 / 组件结构规则

1. **主页面**使用 `@Page("页面名")` 注解，继承 `BasePager`，UI 放在同目录 `PageUI.kt` 的 `buildUI(page)` 中，页面类用 `override fun buildBody(): ViewBuilder = buildUI(this)`。
2. **组合组件** UI 写在 `override fun body()` 中。
3. **渲染方法提取与调用**：拆分为独立渲染方法时，声明为返回 `ViewBuilder` 的私有方法，调用处用 `apply()` 包裹展开到当前渲染上下文（不要用 `ViewContainer` 扩展函数直接替代）。

## Vue 迁移专项检查

- 所有 Vue 元素（data/ref/reactive、props/defineProps、computed、watch、methods、生命周期、template、style、请求、存储）已迁移且**零新增**（零创造 / 零遗漏）。
- `props`/`defineProps` → `ComposeAttr`；`$emit`/`defineEmits` → `ComposeEvent`。
- `ref`/`reactive` → `observable` / `observableList`；`v-if` → `vif`；`v-for` → `vforIndex`/`vforLazy`；`@click` → `event { click }`。
- `setTimeout`/`setInterval` → `Timer`（页面/组件销毁必须 `cancel()`）。
- `async`/`await` → `GlobalScope.launch`（Kuikly 版协程，禁止 `kotlinx.coroutines` / `runBlocking`）。
- 路由 `route.query.x` → `pagerData.params.optString("x", "")`。
- 网络 API 使用 `ReqConfig.kt` 常量，禁止字符串字面量。
- 存储 / 账号 / 环境 / 分享 / 上报 / 事件总线等业务原生能力，先搜索项目已有 Module / 工具类复用，而非凭空假设符号。

## 编译验证

运行可用编译命令（如 `./gradlew :shared:compileKotlinIosArm64`、`packLocalJSBundleRelease`）直至通过，失败立即修正，不积累错误。
