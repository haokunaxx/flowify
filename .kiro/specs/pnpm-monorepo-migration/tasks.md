# 任务列表

## 任务 1: 创建 Monorepo 基础结构
- [x] 1.1 创建根目录配置文件
  - 创建 `pnpm-workspace.yaml`
  - 更新根 `package.json`（重命名为 flowify，添加 workspace 脚本）
  - 更新根 `tsconfig.json`（添加 references）
- [x] 1.2 创建 packages 目录结构
  - 创建 `packages/core/` 目录
  - 创建 `packages/engine/` 目录
  - 创建 `packages/editor/` 目录

## 任务 2: 迁移 @flowify/core 包
- [x] 2.1 创建 core 包配置
  - 创建 `packages/core/package.json`
  - 创建 `packages/core/tsconfig.json`
- [x] 2.2 迁移 core 源代码
  - 移动 `src/core/types.ts` 到 `packages/core/src/types.ts`
  - 移动 `src/core/errors.ts` 到 `packages/core/src/errors.ts`
  - 创建 `packages/core/src/index.ts` 导出文件
- [x] 2.3 验证 core 包构建
  - 运行 `pnpm --filter @flowify/core build`
  - 确认 dist 目录生成正确

## 任务 3: 迁移 @flowify/engine 包
- [x] 3.1 创建 engine 包配置
  - 创建 `packages/engine/package.json`
  - 创建 `packages/engine/tsconfig.json`
- [x] 3.2 迁移 engine 源代码
  - 移动 `src/scheduler/` 到 `packages/engine/src/scheduler/`
  - 移动 `src/executor/` 到 `packages/engine/src/executor/`
  - 移动 `src/context/` 到 `packages/engine/src/context/`
  - 移动 `src/events/` 到 `packages/engine/src/events/`
  - 移动 `src/hooks/` 到 `packages/engine/src/hooks/`
  - 移动 `src/async/` 到 `packages/engine/src/async/`
  - 移动 `src/progress/` 到 `packages/engine/src/progress/`
  - 移动 `src/registry/` 到 `packages/engine/src/registry/`
  - 移动 `src/tools/` 到 `packages/engine/src/tools/`
  - 移动 `src/ui/` 到 `packages/engine/src/ui/`
  - 移动 `src/engine/` 到 `packages/engine/src/engine/`
- [x] 3.3 更新 engine 导入路径
  - 将所有 `../core` 导入替换为 `@flowify/core`
  - 创建 `packages/engine/src/index.ts` 导出文件
- [x] 3.4 迁移 engine 测试文件
  - 移动所有 `*.test.ts` 文件到对应目录
  - 更新测试文件中的导入路径
- [x] 3.5 验证 engine 包构建和测试
  - 运行 `pnpm --filter @flowify/engine build`
  - 运行 `pnpm --filter @flowify/engine test`
  - 确认所有测试通过

## 任务 4: 创建 @flowify/editor 包
- [x] 4.1 创建 editor 包配置
  - 创建 `packages/editor/package.json`
  - 创建 `packages/editor/tsconfig.json`
- [x] 4.2 创建 editor 目录结构
  - 创建 `packages/editor/src/tools/` 目录
  - 创建 `packages/editor/src/ui/` 目录
  - 创建 `packages/editor/src/editor/` 目录
  - 创建 `packages/editor/src/index.ts` 导出文件

## 任务 5: 实现内置工具
- [x] 5.1 实现 Echo 工具
  - 创建 `packages/editor/src/tools/echo.ts`
  - 实现 ToolRegistration 接口
  - 导出 echoTool
- [x] 5.2 实现 Delay 工具
  - 创建 `packages/editor/src/tools/delay.ts`
  - 实现 ToolRegistration 接口
  - 导出 delayTool
- [x] 5.3 创建工具导出入口
  - 创建 `packages/editor/src/tools/index.ts`
  - 导出所有内置工具
  - 提供 registerBuiltinTools 辅助函数

## 任务 6: 实现内置 UI 组件
- [x] 6.1 实现 Confirm 组件
  - 创建 `packages/editor/src/ui/confirm.tsx`
  - 实现 UIComponentRegistration 接口
  - 实现 React 组件 ConfirmDialog
- [x] 6.2 实现 Select 组件
  - 创建 `packages/editor/src/ui/select.tsx`
  - 实现 UIComponentRegistration 接口
  - 实现 React 组件 SelectDialog
- [x] 6.3 创建 UI 组件导出入口
  - 创建 `packages/editor/src/ui/index.ts`
  - 导出所有内置 UI 组件
  - 提供 registerBuiltinUIComponents 辅助函数

## 任务 7: 更新示例代码
- [x] 7.1 更新 demo.ts
  - 更新导入路径为 `@flowify/engine`
  - 验证示例能正确运行
- [x] 7.2 更新 demo-ui.ts
  - 更新导入路径为 `@flowify/engine`
  - 验证示例能正确运行
- [x] 7.3 创建 editor 示例
  - 创建使用内置工具和 UI 的示例
  - 演示完整工作流执行

## 任务 8: 配置测试和构建
- [x] 8.1 更新 vitest 配置
  - 更新 `vitest.config.ts` 支持 monorepo
  - 配置测试文件路径
- [x] 8.2 更新 .gitignore
  - 添加 `packages/*/dist/` 忽略规则
  - 添加 `packages/*/node_modules/` 忽略规则
- [x] 8.3 验证完整构建流程
  - 运行 `pnpm install`
  - 运行 `pnpm build`
  - 运行 `pnpm test`
  - 确认所有步骤成功

## 任务 9: 清理旧代码
- [x] 9.1 删除旧 src 目录
  - 确认所有代码已迁移
  - 删除 `src/` 目录
- [x] 9.2 更新文档
  - 更新 README.md（如果存在）
  - 记录新的项目结构
