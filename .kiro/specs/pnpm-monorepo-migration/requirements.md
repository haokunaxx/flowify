# 需求文档

## 简介

将现有的工作流引擎项目从单体架构迁移到 pnpm + monorepo 架构（项目名：Flowify），以支持更好的代码组织、独立版本发布和可视化流程编排器的开发。

## 术语表

- **Flowify**: 项目名称，包含工作流引擎和可视化编排器
- **Monorepo**: 一种代码仓库管理策略，将多个相关项目放在同一个代码仓库中管理
- **pnpm**: 高性能的 Node.js 包管理器，原生支持 workspace 功能
- **Workspace**: pnpm 的工作区功能，用于管理 monorepo 中的多个包
- **Project_References**: TypeScript 的项目引用功能，用于管理多项目间的依赖和增量构建

## 包结构概览

```
flowify/                              # 根项目 (name: "flowify")
├── packages/
│   ├── core/                         # @flowify/core - 核心类型和错误定义
│   ├── engine/                       # @flowify/engine - 工作流引擎核心
│   └── editor/                       # @flowify/editor - 可视化编排器 + 内置工具/UI
└── examples/                         # 示例代码
```

## 需求

### 需求 1：项目结构重组

**用户故事：** 作为开发者，我希望将项目重组为 monorepo 结构，以便更好地组织代码和管理依赖。

#### 验收标准

1.1 THE Root_Project SHALL 命名为 `flowify`
1.2 THE Migration SHALL 创建以下包目录结构：
   - `packages/core/` - 核心类型和错误定义
   - `packages/engine/` - 工作流引擎核心
   - `packages/editor/` - 可视化编排器和内置工具/UI
1.3 WHEN 迁移完成后 THEN 每个包 SHALL 包含独立的 `package.json` 文件
1.4 WHEN 迁移完成后 THEN 每个包 SHALL 包含独立的 `tsconfig.json` 文件

### 需求 2：pnpm Workspace 配置

**用户故事：** 作为开发者，我希望使用 pnpm workspace 管理多包依赖，以便简化依赖管理和提高安装效率。

#### 验收标准

2.1 THE Root_Directory SHALL 包含 `pnpm-workspace.yaml` 配置文件
2.2 WHEN `pnpm-workspace.yaml` 配置完成后 THEN 它 SHALL 正确声明 `packages/*` 目录
2.3 THE Root_Package_Json SHALL 配置 `"type": "module"` 以支持 ES 模块
2.4 WHEN 运行 `pnpm install` THEN 系统 SHALL 正确解析所有工作区包的依赖
2.5 THE Workspace_Protocol SHALL 用于包间依赖声明（如 `"@flowify/core": "workspace:*"`）

### 需求 3：TypeScript 项目引用配置

**用户故事：** 作为开发者，我希望使用 TypeScript 项目引用，以便实现增量构建和更好的 IDE 支持。

#### 验收标准

3.1 THE Root_Tsconfig SHALL 配置 `references` 数组指向所有子包
3.2 WHEN 子包 tsconfig 配置完成后 THEN 它 SHALL 包含 `composite: true` 选项
3.3 THE Engine_Package_Tsconfig SHALL 引用 Core_Package
3.4 THE Editor_Package_Tsconfig SHALL 引用 Core_Package 和 Engine_Package
3.5 WHEN 运行 `tsc --build` THEN 系统 SHALL 按依赖顺序增量构建所有包

### 需求 4：包命名和版本管理

**用户故事：** 作为开发者，我希望每个包有独立的命名和版本，以便支持独立发布。

#### 验收标准

4.1 THE Core_Package SHALL 命名为 `@flowify/core`
4.2 THE Engine_Package SHALL 命名为 `@flowify/engine`
4.3 THE Editor_Package SHALL 命名为 `@flowify/editor`
4.4 WHEN 包初始化时 THEN 每个包 SHALL 使用 `0.1.0` 作为初始版本
4.5 THE Package_Json SHALL 包含正确的 `main`、`types` 和 `exports` 字段配置

### 需求 5：Core 包迁移

**用户故事：** 作为开发者，我希望核心类型定义独立为一个包，以便被其他包共享依赖。

#### 验收标准

5.1 THE Core_Package SHALL 包含 `src/types.ts`（从 `src/core/types.ts` 迁移）
5.2 THE Core_Package SHALL 包含 `src/errors.ts`（从 `src/core/errors.ts` 迁移）
5.3 THE Core_Package SHALL 导出所有类型定义和错误类
5.4 THE Core_Package SHALL 无运行时依赖（纯 TypeScript 类型）

### 需求 6：Engine 包迁移

**用户故事：** 作为开发者，我希望工作流引擎核心独立为一个包，提供纯粹的执行能力。

#### 验收标准

6.1 THE Engine_Package SHALL 包含以下模块：
   - scheduler（DAG 调度）
   - executor（步骤执行）
   - context（上下文管理）
   - events（事件系统）
   - hooks（Hook 管理）
   - async（异步等待）
   - progress（进度管理）
   - registry（注册表机制）
   - tools（工具调用器）
   - ui（UI 交互处理器）
   - engine（主引擎类）
6.2 WHEN 迁移完成后 THEN 所有 `../core` 导入 SHALL 更新为 `@flowify/core`
6.3 THE Engine_Package SHALL 导出与原项目相同的公共 API
6.4 WHEN 迁移完成后 THEN 所有现有测试 SHALL 通过

### 需求 7：Editor 包创建

**用户故事：** 作为开发者，我希望有一个可视化编排器包，包含内置工具和 UI 组件，以便快速开发和测试工作流。

#### 验收标准

7.1 THE Editor_Package SHALL 包含内置工具实现目录 `src/tools/`
7.2 THE Editor_Package SHALL 包含内置 UI 组件目录 `src/ui/`
7.3 THE Editor_Package SHALL 包含可视化编排器目录 `src/editor/`
7.4 THE Editor_Package SHALL 依赖 `@flowify/core` 和 `@flowify/engine`
7.5 THE Editor_Package SHALL 支持 React 作为 UI 框架

### 需求 8：内置工具实现

**用户故事：** 作为开发者，我希望有基础的内置工具，以便快速验证工作流执行。

#### 验收标准

8.1 THE Editor_Package SHALL 包含 Echo 工具（回显输入）
8.2 THE Editor_Package SHALL 包含 Delay 工具（延时执行）
8.3 WHEN 工具注册到引擎后 THEN 它们 SHALL 能够在工作流中被调用
8.4 THE Tools SHALL 实现 `ToolRegistration` 接口

### 需求 9：内置 UI 组件实现

**用户故事：** 作为开发者，我希望有基础的内置 UI 组件，以便快速验证 UI 交互流程。

#### 验收标准

9.1 THE Editor_Package SHALL 包含 Confirm 组件（确认框）
9.2 THE Editor_Package SHALL 包含 Select 组件（选择器）
9.3 WHEN UI 组件注册到引擎后 THEN 它们 SHALL 能够在工作流中被渲染
9.4 THE UI_Components SHALL 实现 `UIComponentRegistration` 接口
9.5 THE UI_Components SHALL 使用 React 实现

### 需求 10：构建和测试配置

**用户故事：** 作为开发者，我希望有统一的构建和测试脚本，以便一键操作所有包。

#### 验收标准

10.1 THE Root_Package_Json SHALL 包含 `build` 脚本用于构建所有包
10.2 THE Root_Package_Json SHALL 包含 `test` 脚本用于运行所有包的测试
10.3 THE Root_Package_Json SHALL 包含 `dev` 脚本用于开发模式
10.4 WHEN 运行 `pnpm build` THEN 系统 SHALL 按依赖顺序构建所有包
10.5 THE Vitest_Config SHALL 正确配置以支持 monorepo 结构

### 需求 11：示例代码迁移

**用户故事：** 作为开发者，我希望示例代码能正确迁移并继续工作，以便作为使用参考。

#### 验收标准

11.1 THE Examples_Directory SHALL 保留在根目录
11.2 WHEN 迁移示例代码时 THEN 系统 SHALL 更新导入路径为 `@flowify/engine`
11.3 THE Root_Package_Json SHALL 包含 `demo` 脚本用于运行示例
11.4 WHEN 运行示例时 THEN 系统 SHALL 能够正确执行工作流
