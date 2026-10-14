# Vue3 语义映射

## 目录

1. 映射原则
2. script setup 宏
3. 响应式状态
4. watch 与副作用
5. 生命周期
6. 高阶 Vue3 能力
7. JavaScript/Kotlin 语义差异

## 1. 映射原则

按“读取者、写入者、更新时机、清理时机”迁移语义，不按 API 名字做一对一替换。先确认目标字段是否驱动 UI；只有被响应式 UI、条件、循环或监听读取的可变值才需要 Kuikly 响应式能力。

## 2. script setup 宏

| Vue3 | Kuikly 落点 | 必须保留 |
| --- | --- | --- |
| `defineProps<T>()` | 组件 `ComposeAttr` 字段 | 类型、required、默认值、父到子更新 |
| `withDefaults(defineProps(), defaults)` | Attr 默认值 | 默认值求值时机；对象默认值不能意外共享可变实例 |
| `defineEmits<T>()` | `ComposeEvent` 回调或目标项目既有事件封装 | 事件名、参数顺序、可空性、触发时机 |
| `defineModel()` | Attr 值 + `update:modelValue` 对应事件 | 双向更新协议，不只迁移本地字段 |
| `defineExpose()` | `ViewRef`/显式组件方法 | 只暴露源组件实际暴露且父级实际调用的能力 |
| `defineSlots()` | 显式内容构建回调 | slot 名、参数类型、fallback 和调用次数 |
| `defineOptions()` | 页面/组件元数据或目标注册配置 | name、inheritAttrs、自定义 options；无消费者的编译期元数据不创造运行逻辑 |
| `useSlots()` / `useAttrs()` | 显式内容构建回调/Attr 透传 | slot 名、fallback、作用域参数、attrs 合并顺序 |

页面路由参数不是组件 props。页面从目标项目既有路由参数入口读取，通常是 `pagerData.params`，但应先搜索目标项目。

## 3. 响应式状态

| Vue3 | 候选实现 | 语义检查 |
| --- | --- | --- |
| `ref(primitive)` | UI 状态用 `var x by observable(initial)`；非 UI 状态用普通字段 | `.value` 的所有读写都要迁移 |
| `ref(array)` | 需要增量 UI 的列表用 `observableList<T>()` | 替换、push/splice、排序和清空的通知次数 |
| `ref(object)` | observable 的对象引用或拆分字段 | Kuikly 不自动等价追踪任意深层属性；深层变更时替换引用或显式响应式化 |
| `reactive(object)` | 明确的数据类 + 响应式拥有者字段 | 避免假设 Kotlin 数据类内部属性天然响应式 |
| `computed(getter)` | 无副作用时优先 Kotlin getter/函数 | 每次求值与 Vue 缓存语义不同；若缓存或求值次数可见，改为受依赖监听驱动的存储状态 |
| writable `computed` | getter + 显式 setter | 保留 setter 的验证、转换和副作用 |
| `readonly` | 只暴露 `val`/只读接口 | 不能把只读约束丢掉 |
| `toRef/toRefs` | 显式 getter/setter 或同一状态拥有者 | 保持别名写入同一底层状态，不复制值 |

`shallowRef/shallowReactive/customRef/triggerRef/markRaw` 都在改变依赖追踪边界或触发时机。没有确认目标等价机制时，显式建模“哪些写入触发 UI”，不能退化成普通 `observable` 后声称等价。

不要使用不存在的“computed observable”写法。优先搜索目标 Kuikly 版本中的 `observable`/`observableList` 签名。

批量替换列表时先在普通临时集合中完成计算，再对 `ObservableList` 执行最少次数的 `clear()`/`addAll()`；需要保留逐项动画或事件时按源行为处理。

## 4. watch 与副作用

Kuikly 的 `bindValueChange` 可监听响应式表达式，但当前框架实现首次绑定会立即回调。这与 Vue `watch` 默认 `immediate: false` 不同。

迁移每个 watch 时记录：

- source 是单值、getter、数组还是对象；
- `immediate`、`deep`、`flush`、`once`；
- 回调是否依赖 old value；
- `onCleanup`/取消请求/取消定时器；
- 组件销毁时是否仍可能回调。

实现规则：

1. 普通 `watch` 默认跳过 Kuikly 首次绑定回调；`immediate: true` 才执行首次副作用。
2. 需要 old value 时自行保存上次值，并在调用后更新。
3. `deep: true` 不能靠监听对象引用冒充；监听实际可变字段，或让深层写入替换被监听引用。
4. `flush: 'post'` 的布局后语义应映射到目标项目的 next-tick/布局完成机制，不能直接同步调用。
5. 每次重新执行前调用上一次 cleanup；在 `pageWillDestroy()`/`viewDestroyed()` 再执行最终 cleanup。
6. 手工绑定的 observer 使用稳定 owner，并在销毁时调用目标 API 对应的 unbind。

`watchEffect` 首次立即执行且自动收集依赖，可用表达式绑定表达，但仍要保留 cleanup 和执行时机。不要把业务副作用放进 UI `attr {}` 求值中。

## 5. 生命周期

按语义选择，不按名称硬配：

| Vue3 时机 | Kuikly 自研 DSL 候选 |
| --- | --- |
| `setup()` 中纯初始化 | 构造期普通字段或 `created()` |
| `onBeforeMount` | `viewWillLoad()` |
| `onMounted`，只要求 UI 树已创建 | `viewDidLoad()` |
| `onMounted`，要求尺寸/布局 | `viewDidLayout()` 或目标项目布局回调 |
| 页面每次可见/不可见 | `pageDidAppear()` / `pageDidDisappear()` |
| `onBeforeUnmount` | 页面 `pageWillDestroy()`；组件 `viewWillUnload()` |
| `onUnmounted` | 组件 `viewDestroyed()`；页面清理必须在 `pageWillDestroy()` 完成 |

Vue `KeepAlive` 的 activated/deactivated 与普通页面 appear/disappear 不完全等价。只有目标容器生命周期一致时才映射；否则报告差异。

`onBeforeUpdate/onUpdated` 不能机械映射为页面 appear。定位它依赖的具体响应式字段和 DOM/layout 副作用，改为字段监听、next-tick 或布局回调。`onErrorCaptured`、render tracking 等能力需要目标错误边界/诊断 API；不存在时保留错误传播影响并列出缺口。

## 6. 高阶 Vue3 能力

- `provide/inject`：优先使用显式 Attr/Event 或目标项目已有上下文/依赖容器。保持 provider 作用域和默认值，不能改成无边界全局单例。
- slots：保持 default/named/scoped slot、fallback 与渲染次数。使用目标项目已有 ViewBuilder/内容回调模式；没有先例时先做最小实验并编译。
- `Teleport`：通常需要目标项目的 Modal/overlay/根容器能力。保持挂载层级、z-order、返回键、遮罩点击与生命周期；不能仅删除 Teleport 包装。
- `Suspense`/异步组件：显式迁移 pending/resolved/error 三类状态及重试行为。
- `<component :is>`：对有限类型用响应式分支；开放注册表则保留注册机制，不能按当前样本写死。
- template/component ref：用目标项目 `ViewRef` 或显式组件方法；只创建源代码实际读取的引用。
- `nextTick`：使用目标项目已有 next-tick/布局任务 API，确认它要求 UI flush 还是仅任务排队。

## 7. JavaScript/Kotlin 语义差异

- 区分 `null`、`undefined`、字段不存在和空字符串；不要统一成 Kotlin 非空默认值。
- JS truthy/falsy 不能直接当 Kotlin Boolean。逐处写出等价条件。
- 保留 `===` 的类型约束、可选链短路、`??` 与 `||` 的差异。
- 数值默认可能是 Double；转 Int/Float 时确认截断、溢出和字符串解析失败行为。
- 对象/数组比较在 JS 常为引用比较；Kotlin `==` 是结构相等。需要引用语义时使用 `===`。
- 保留 Promise 的并发/串行、错误传播和 finally；迁移为 Kuikly 版协程时不要改变请求顺序。

Vue3 仍可使用 Options API。遇到 `data/props/computed/watch/methods/emits` 时按本文件同一语义规则建立账本，不要因为没有 `<script setup>` 而跳过分析。
