# Vue3 集成能力映射

## 目录

1. Router
2. Pinia 与共享状态
3. 网络与异步
4. 存储和平台能力
5. 定时器、监听和清理

## 1. Router

- `route.params/query`：从目标项目页面参数对象读取，Kuikly 常见入口是 `pagerData.params`。
- `router.push/replace/back`：使用目标项目已有 RouterModule/Bridge；保留 push 与 replace、返回栈、参数编码和 close-current 差异。
- route guard：迁移判断、异步等待、重定向和取消；不要仅迁移最终页面。
- nested route/tab route：先判断源是在切换页面栈、同页 PageList，还是两者组合。

页面参数默认值要保留 JS 的缺失/空值区别。不能把所有参数 `optString(..., "")` 后视为同一状态。

## 2. Pinia 与共享状态

记录 store 生命周期、共享范围、持久化、getter、action、订阅和跨页面写入：

- 页面私有 store 可落到页面状态或 ViewModel；
- 跨页面 store 使用目标项目已有共享状态容器，不擅自创建进程级 singleton；
- getter 按 computed 语义处理；action 保持串行/并发和异常传播；
- `$subscribe/$onAction` 必须保存取消句柄并清理；
- persisted state 迁移到目标存储时保持 key、版本、序列化和迁移逻辑。

## 3. 网络与异步

先搜索目标 NetworkModule、请求封装、DTO/JSON、错误类型和协程模式。必须保留：

- URL/baseURL、method、headers、query/body、timeout；
- 请求并发或顺序、取消、重试、去重；
- loading 开始/结束、错误分支、finally；
- 响应字段缺失、类型转换和分页游标；
- API key 的安全来源。

commonMain 使用 Kuikly 版协程与 JSON。不要在同步 `attr {}` 或构建 UI 时启动 suspend 调用；从生命周期或事件回调进入目标 lifecycle scope。

## 4. 存储和平台能力

- local/session storage、cookie、IndexedDB：使用目标项目已有 SharedPreferences/Storage/Bridge，并保持同步/异步、作用域、过期和序列化语义。
- `window/document/location/history`：先判断是布局、导航、事件还是宿主能力，再映射到 PageData、Router 或 Module；commonMain 不保留 DOM API。
- clipboard、camera、share、login、theme、analytics 等必须走目标已有 Module/业务 Skill。没有明确接口时不创造桥接。
- 环境变量和 secret 使用目标构建配置；禁止硬编码到 Kotlin。

## 5. 定时器、监听和清理

为每个资源建立“创建 -> owner -> 取消”三元组：

| Vue | Kuikly 候选 | 清理 |
| --- | --- | --- |
| `setTimeout` | 当前 PagerScope `setTimeout` | 保存 ref，销毁时 `clearTimeout` |
| `setInterval` | Timer/目标调度器 | `cancel()` |
| EventBus / emitter | NotifyModule/业务 Module | 保存 listener token 并 remove |
| DOM/window listener | 对应 Module/page event | 显式 unregister |
| fetch/Promise cancel | lifecycle scope/job/request token | 页面或组件销毁时取消 |

回调触发时机、是否立即执行、线程和重复注册都属于语义。只写清理函数但没有保存实际句柄不算完成。
