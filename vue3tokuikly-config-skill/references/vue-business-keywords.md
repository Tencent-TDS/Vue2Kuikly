# Vue3 中特定业务关键字对应的代码

【】中是业务关键字，后面是其对应关键代码，出现对应关键代码，则认为页面有【】业务关键字。

> 说明：以下特征均为 Vue3（含 Vue2 兼容）项目的真实写法。与 Hippy/React 不同，Vue 以 SFC（`.vue`）组织，状态多用 `ref`/`reactive`（Composition API）或 `data()`（Options API），路由多用 `vue-router`，状态管理多用 `Pinia`/`Vuex`。

## 【本地存储】
- `localStorage.getItem` / `localStorage.setItem`
- `sessionStorage`
- `Pinia` + `persist` 插件（`$persist` / `store.$state` 持久化）
- `Vuex` state 持久化（`localStorage` 配合 `subscribe`）
- `localForage` / `idb`
- `this.$storage` / `this.$cookies` / `js-cookie`
- `uni.setStorageSync` / `wx.setStorageSync`（跨端 Vue 项目）

## 【滑动加载更多】
- `@scrolltolower` / `onScrollToLower`
- `onEndReached`（列表组件）
- `loadMore` / `onLoadMore` / `onReachBottom`
- `hasMore` / `finished` / `loading` 状态位
- `vant` 的 `van-list` `@load`

## 【平台设备信息】
- `window.screen` / `window.innerWidth` / `window.innerHeight`
- `wx.getSystemInfoSync` / `wx.getWindowInfo` / `wx.getDeviceInfo`
- `uni.getSystemInfoSync` / `uni.getSystemInfo`
- `plus.device` / `plus.screen`（5+ / uni-app 原生环境）
- `DeviceInfo`（`react-native-device-info` 混用场景，谨慎识别）
- `env(safe-area-inset-*)` / `safe-area-inset`
- `wx.getMenuButtonBoundingClientRect`（小程序胶囊按钮）

## 【时间】
- `new Date` / `Date.now` / `new Date().getTime()`
- `getFullYear` / `getMonth` / `getDate` / `getDay`
- `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval`
- `moment` / `dayjs` / `date-fns`

## 【路由导航】
- `vue-router` / `createRouter`
- `this.$router.push` / `this.$router.replace` / `this.$router.back`
- `useRouter` / `useRoute`
- `this.$route.query` / `this.$route.params` / `route.query`
- `<router-link>` / `<router-view>`
- `router.beforeEach`（路由守卫）

## 【状态管理】
- `Pinia` / `defineStore` / `useStore`
- `Vuex` / `new Vuex.Store` / `mapState` / `mapActions`
- `ref` / `reactive` / `computed` / `watch`（Composition API）
- `provide` / `inject`

## 【自定义子组件】
- `.vue` 单文件组件（SFC）
- `components: { ... }` 局部注册 / 全局 `app.component`
- `props` / `defineProps`（`setup` 语法）
- `$emit` / `defineEmits` / `this.$emit`
- `<script setup>` 语法
