# 第三方组件库映射

## 目录

1. 行为拆解方法
2. Vant 常见组件
3. 其他组件库
4. 等价性门禁

## 1. 行为拆解方法

第三方组件没有可靠的按名称替换。对每个实例记录：props、slots、events、v-model、公开方法、ref 调用、loading/error/empty/disabled 状态、默认样式和容器约束，再选择 Kuikly 原生组件、目标项目封装或组合组件。

同一源组件可因 props 不同映射到不同 Kuikly 结构。不要把未使用的组件库能力搬过去，也不要遗漏当前实例实际启用的默认行为。

## 2. Vant 常见组件

| Vant | Kuikly 候选结构 | 不能遗漏 |
| --- | --- | --- |
| `van-list` | `List` + `FooterRefresh` | loading 去重、finished、error、offset、immediate-check、load 完成时机 |
| `van-pull-refresh` | `List` 内 `Refresh` | v-model refreshing、成功文案、head slot、禁用、刷新结束 |
| `van-swipe`/item | `SliderPage` 或 `PageList` | loop、autoplay、duration、initial-swipe、show-indicators、swipeTo、change |
| `van-tabs` | 自定义 tab header + `PageList`/`SliderPage` | sticky、swipeable、lazy-render、before-change、line 样式、滚动定位 |
| `van-tabbar`/item | 目标路由容器 + tab View | route 模式、replace、active color、badge、safe area、fixed |
| `van-image` | `Image` + 状态节点 | fit、round、lazy-load、loading/error slot、preview、block |
| `van-icon` | 目标图标资源/Image/Text icon | name 到实际 asset 的映射、size、color、badge、点击区域 |
| `van-popup` | Modal/overlay | position、teleport、lock-scroll、close-on-popstate、before-close |
| `van-cell` | 组合 View | title/value/label/icon/arrow、clickable、border 和 slot |
| `van-loading` | ActivityIndicator + Text | type、size、color、垂直布局 |

示例：`van-list` 外层套 `van-pull-refresh` 时，不是两个独立滚动容器。Kuikly 通常由同一个 `List` 同时承载 `Refresh`、items 和 `FooterRefresh`，并分别维护刷新和加载更多的并发状态。

Vant `swipeTo(index, options)` 是命令式能力。迁移时保存目标 `ViewRef` 并调用当前 PageList/SliderPage 支持的方法；不能只更新一个 index 文本状态。

Vant icon name 不是可直接传给 Kuikly Image 的 URI。必须找到目标 assets、宿主 icon module 或项目已有映射；找不到时报告缺失资源，不凭名字画图标。

## 3. 其他组件库

Element Plus、Naive UI、Ant Design Vue 等桌面组件通常包含 portal、表单校验、键盘导航、虚拟列表和复杂 slot。处理方式相同：

1. 只分析源码实际实例化的组件和 props；
2. 阅读目标版本组件文档或源码确认默认行为；
3. 搜索目标项目封装；
4. 用 Kuikly 原语组合等价行为；
5. 对无法跨移动端等价的 hover、DOM 测量、portal 或键盘行为列出差异并测试替代交互。

## 4. 等价性门禁

组件映射完成前逐项回答：

- 首次加载、重复触发和并发时是否一致？
- empty/loading/error/finished/disabled 是否都有分支？
- v-model 是值更新、可见性还是异步状态？
- slot 内容和默认样式是否改变了节点层级？
- ref 暴露的方法是否被父级调用？
- 路由、滚动、遮罩和返回键是否仍由同一拥有者管理？

任何一项未知都不是“已完成映射”。先搜索和验证，仍无法确认时作为显式语义缺口交付。
