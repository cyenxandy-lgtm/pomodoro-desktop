# Pomodoro

一款使用 Tauri 2、React、TypeScript 和 Rust 构建的 Windows 番茄钟桌面应用。

桌面版由 Rust Timer 持有权威状态，使用目标结束时间与当前时间校准倒计时；SQLite 保存 Session、活动计时器、当前模式和番茄循环。应用支持完整的 Focus → Short Break / Long Break 循环、暂停恢复、重置、跳过、自动开始、原生提示音、Windows 通知和系统托盘控制。

## 功能

- Focus、Short Break、Long Break 三种模式
- 默认 25 / 5 / 15 分钟，可配置 Long Break 间隔（2–8 个 Focus）
- 开始、暂停、继续、重置和跳过
- 可选自动开始休息、自动开始 Focus
- Rust wall-clock Timer，避免 WebView 卡顿造成累计误差
- SQLite v3 持久化、历史数据安全迁移与统计复合索引
- Today、7/30 天趋势、Current/Longest Streak、All-Time 与最近 Session 统计
- 原生完成提示音和桌面通知
- 系统托盘显示状态，可直接开始/暂停/继续、重置、跳过和退出
- 可选关闭到托盘、最小化到托盘
- 全局快捷键直接控制同一个 Rust Timer，不依赖 WebView 焦点
- 单窗口紧凑模式，保留当前模式、倒计时和运行状态
- 可选始终置顶，并分别记忆标准/紧凑窗口的位置与尺寸
- 浏览器开发模式提供等价的本地 fallback

## 全局快捷键

| 操作 | 快捷键 |
| --- | --- |
| 开始 / 暂停 / 继续 | `Ctrl + Alt + Space` |
| 重置 | `Ctrl + Alt + R` |
| 跳过当前阶段 | `Ctrl + Alt + S` |
| 显示 / 隐藏主窗口 | `Ctrl + Alt + P` |

快捷键默认开启，可在设置中关闭。如果某个组合键被其他程序占用，应用会继续运行并在设置页提示不可用的组合键。

## 环境要求

- Node.js 20+
- Rust stable toolchain
- Windows 10/11 与 Microsoft WebView2
- Tauri 的 Windows 构建依赖（MSVC Build Tools）

## 开发

安装依赖：

```bash
npm install
```

启动浏览器开发模式：

```bash
npm run dev
```

启动 Tauri 桌面开发模式：

```bash
npm run dev:tauri
```

## 检查与测试

```bash
npm run test
npm run lint
npm run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

## Production Build

```bash
npm run build:tauri
```

Windows 可执行文件和 NSIS 安装包输出到：

```text
src-tauri/target/release/app.exe
src-tauri/target/release/bundle/nsis/
```

Windows 原生通知需要从安装后的应用运行，开发模式下是否显示由 Windows 的应用身份和通知设置决定。

## 主要目录

- `src/components/`：模式切换、计时控制、统计和设置 UI
- `src/hooks/useTimer.ts`：React Timer 状态订阅与窗口恢复校准
- `src/hooks/useStatistics.ts`：统计加载、错误恢复、窗口恢复刷新
- `src/domain/statistics.ts`：Legacy/SQLite 合并、日期补零、Streak 与汇总
- `src/services/StatisticsService.ts`：严格类型化的 Statistics IPC adapter
- `src/services/TauriTimerService.ts`：React 与 Rust Timer 的 IPC adapter
- `src/services/WebTimerService.ts`：浏览器开发与测试 fallback
- `src/repositories/`：Session 查询边界
- `src/utils/storage.ts`：设置迁移与本地偏好持久化
- `src-tauri/src/timer/`：Rust Timer domain、状态机、运行时和恢复逻辑
- `src-tauri/src/db/`：SQLite schema、v1 → v3 安全迁移与 repository
- `src-tauri/src/statistics.rs`：有界 Statistics 查询服务与 DTO
- `src-tauri/src/audio.rs`：不依赖 WebView 的原生完成提示音
- `src-tauri/src/notification.rs`：原生完成通知
- `src-tauri/src/desktop.rs`：系统托盘与桌面生命周期
- `src-tauri/src/shortcuts.rs`：全局快捷键注册、冲突降级与 action 映射
- `src-tauri/src/window_state.rs`：窗口模式、置顶和多显示器/DPI 恢复
- `src-tauri/src/commands.rs`：Timer、Session 和桌面设置 IPC commands

## 本地数据

桌面版数据位于 Tauri 应用数据目录：`pomodoro.sqlite3` 保存 Timer 与 Session，`window-state.json` 保存标准/紧凑窗口的独立 bounds 和桌面偏好。浏览器开发模式使用 `localStorage`。应用不需要账号、服务器或云同步。
