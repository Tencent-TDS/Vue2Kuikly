# 生成与验证

## 目录

1. 文件生成
2. Source 注释
3. 单文件门禁
4. 双向语义审计
5. 编译与运行验证
6. 完成报告

## 1. 文件生成

跟随目标项目相邻代码的命名、基类、可见性、版权头、package 和 UI 分文件方式。默认自研 DSL 页面是 `<PageName>Page.kt` + `pageUI.kt`；这只是无目标先例时的 fallback，不覆盖项目现有 `Xxx.kt + PageUI.kt`、`buildBody()` 等约定。

不要预先创建空 ViewModel、model、utils 或 ComposeView。只有源代码存在对应职责且拆分符合目标项目边界时才创建文件。

页面 UI 分文件时，页面类只保留状态、方法、生命周期和 `buildUI(this)` 入口；组件 UI 留在组件 `body()`。不要为“整洁”把源文件内紧密逻辑任意分层。

## 2. Source 注释

固定使用 `Source:` 前缀：

```kotlin
// Source: src/components/SearchBox.vue defineEmits: update:modelValue
// Source: src/views/Home.vue <van-swipe :loop="false" @change="onChange">
// Source: src/views/Home.vue .page { padding: 12px; }
```

至少覆盖：状态/props/computed/watch、生命周期、副作用、业务方法、条件/循环、组件调用、事件、关键样式、请求/存储/路由。重复的简单叶子属性可在所属结构上方集中标一次，但必须能定位源文件和构造。

## 3. 单文件门禁

每迁移一个文件立即检查：

- package/import 与目标 source set 一致；
- 所有源导出、props、emit 和被调用公开方法都有落点；
- 没有源中不存在的状态、分支、请求、节点和文案；
- directive item 只有一个根，List/Refresh/FooterRefresh 层级合法；
- 所有手工 observer、timer、listener、job 有清理；
- 能运行对应 module 编译时立即编译，并把状态写进 progress。

编译失败时先分类：API 签名、响应式类型、DSL receiver、source set/import、生成注册、平台依赖。按目标源码修复根因，不添加伪兼容扩展。

## 4. 双向语义审计

源到目标：逐项核对以下集合，数量和行为都要一致。

- 文件与依赖；
- props/state/computed/watch；
- methods/actions/副作用；
- 生命周期与 cleanup；
- template 节点、条件、循环、slots；
- style、动态 class、伪元素、动画；
- events、v-model、ref 方法；
- router/store/network/storage/native。

目标到源：对每个 Kotlin 字段、分支、事件、请求、可见节点、文案和资源反查 `Source:`。没有来源的内容属于疑似创造，除非是目标框架所需的机械适配层，并在注释中说明。

语义缺口必须具备：源构造、已搜索位置、缺失的目标能力、当前可编译边界、运行影响。不能用裸 `TODO` 结束。

## 5. 编译与运行验证

1. 从目标 Gradle 工程、README、CI 或相邻迁移页面找真实命令。
2. 先跑最快 common/Android 编译，再按涉及能力补 JS/iOS/其他平台。
3. `kotlinc` 不能替代 KMP module 编译；只有 Gradle 不可用时用于局部语法诊断，并明确局限。
4. 编译错误循环修复到通过；外部基线失败时证明失败不来自本次文件，并保留关键日志。
5. 可运行时对照：首屏、点击、输入、刷新、加载更多、分页、空态、错误态、返回、销毁后回调。

建议静态扫描：

```bash
rg -n "kotlinx\.coroutines|org\.json|android\.|java\.awt|Color\.parseColor" <output>
rg -n "TODO|FIXME" <output>
rg -L "Source:" <generated-kotlin-files>
```

静态扫描命中后逐项判断，不能机械删除合法平台文件或已有代码。

## 6. 完成报告

最终报告只声明实际完成的内容：

- 生成/修改文件；
- 源文件覆盖范围；
- 编译与测试命令及结果；
- 使用的目标项目示例和业务 Skill；
- 未验证平台和剩余语义缺口；
- Vue 源码是否保持未修改。
