# Flowify

一个可扩展的工作流引擎，支持 DAG 调度、工具调用、UI 交互和可视化编排。

## 项目结构

```
flowify/
├── packages/
│   ├── core/           # @flowify/core - 核心类型和错误定义
│   ├── engine/         # @flowify/engine - 工作流引擎核心
│   └── editor/         # @flowify/editor - 内置工具和 UI 组件
└── examples/           # 示例代码
```

## 包说明

| 包名 | 描述 |
|------|------|
| `@flowify/core` | 核心类型定义、错误类、枚举等基础模块 |
| `@flowify/engine` | 工作流引擎核心，包含调度器、执行器、上下文管理等 |
| `@flowify/editor` | 内置工具（Echo、Delay）和 UI 组件（Confirm、Select） |

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 构建

```bash
pnpm build
```

### 运行测试

```bash
pnpm test
```

### 运行示例

```bash
# 基础工作流演示
pnpm tsx examples/demo.ts

# UI 交互演示
pnpm tsx examples/demo-ui.ts

# Editor 内置工具演示
pnpm tsx examples/demo-editor.ts
```

## 开发

本项目使用 pnpm workspace 管理多包结构，TypeScript 项目引用实现增量构建。

### 包依赖关系

```
@flowify/core (无依赖)
      │
      ▼
@flowify/engine (依赖 core)
      │
      ▼
@flowify/editor (依赖 core, engine)
```

### 常用命令

```bash
# 构建所有包
pnpm build

# 构建单个包
pnpm --filter @flowify/engine build

# 运行所有测试
pnpm test

# 开发模式（监听变化）
pnpm dev
```

## 许可证

MIT
