# 技术设计文档

## 概述

本文档描述将现有工作流引擎项目迁移到 Flowify monorepo 架构的技术设计方案。

## 架构设计

### 目录结构

```
flowify/
├── .gitignore
├── package.json                      # 根项目配置
├── pnpm-workspace.yaml               # pnpm workspace 配置
├── tsconfig.json                     # 根 TypeScript 配置
├── vitest.config.ts                  # 测试配置
├── examples/                         # 示例代码
│   ├── demo.ts
│   └── demo-ui.ts
│
└── packages/
    ├── core/                         # @flowify/core
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── types.ts
    │       └── errors.ts
    │
    ├── engine/                       # @flowify/engine
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── scheduler/
    │       ├── executor/
    │       ├── context/
    │       ├── events/
    │       ├── hooks/
    │       ├── async/
    │       ├── progress/
    │       ├── registry/
    │       ├── tools/
    │       ├── ui/
    │       └── engine/
    │
    └── editor/                       # @flowify/editor
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts
            ├── tools/                # 内置工具
            │   ├── index.ts
            │   ├── echo.ts
            │   └── delay.ts
            ├── ui/                   # 内置 UI 组件
            │   ├── index.ts
            │   ├── confirm.tsx
            │   └── select.tsx
            └── editor/               # 可视化编排器（预留）
                └── index.ts
```

### 包依赖关系

```
@flowify/core (无依赖)
      │
      ▼
@flowify/engine (依赖 core)
      │
      ▼
@flowify/editor (依赖 core, engine, react)
```

## 组件设计

### 1. 根项目配置

#### pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
```

#### 根 package.json

```json
{
  "name": "flowify",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "pnpm -r --parallel run dev",
    "demo": "pnpm --filter @flowify/editor run demo"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "fast-check": "^3.15.0",
    "tsx": "^4.21.0",
    "typescript": "^5.3.0",
    "vitest": "^1.1.0"
  }
}
```

#### 根 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true
  },
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/engine" },
    { "path": "./packages/editor" }
  ]
}
```

### 2. @flowify/core 包

#### package.json

```json
{
  "name": "@flowify/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch"
  }
}
```

#### tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"]
}
```

### 3. @flowify/engine 包

#### package.json

```json
{
  "name": "@flowify/engine",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "@flowify/core": "workspace:*"
  }
}
```

#### tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts"],
  "references": [
    { "path": "../core" }
  ]
}
```

### 4. @flowify/editor 包

#### package.json

```json
{
  "name": "@flowify/editor",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch",
    "demo": "tsx src/demo.ts"
  },
  "dependencies": {
    "@flowify/core": "workspace:*",
    "@flowify/engine": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

#### tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../core" },
    { "path": "../engine" }
  ]
}
```

## 内置工具设计

### Echo 工具

```typescript
// packages/editor/src/tools/echo.ts
import type { ToolRegistration, ToolMode, Context } from '@flowify/core';

/**
 * Echo 工具 - 回显输入内容
 * 用于测试和调试工作流
 */
export const echoTool: ToolRegistration = {
  meta: {
    id: 'echo',
    name: 'Echo',
    description: '回显输入内容',
    mode: ToolMode.SYNC,
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '要回显的消息' }
      },
      required: ['message']
    },
    outputSchema: {
      type: 'object',
      properties: {
        echo: { type: 'string' }
      }
    }
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      const { message } = params as { message: string };
      console.log(`[Echo] ${message}`);
      return { echo: message };
    }
  }
};
```

### Delay 工具

```typescript
// packages/editor/src/tools/delay.ts
import type { ToolRegistration, ToolMode, Context } from '@flowify/core';

/**
 * Delay 工具 - 延时执行
 * 用于模拟异步操作或添加等待时间
 */
export const delayTool: ToolRegistration = {
  meta: {
    id: 'delay',
    name: 'Delay',
    description: '延时指定毫秒数',
    mode: ToolMode.ASYNC,
    inputSchema: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: '延时毫秒数' }
      },
      required: ['ms']
    },
    outputSchema: {
      type: 'object',
      properties: {
        delayed: { type: 'number' }
      }
    }
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      const { ms } = params as { ms: number };
      await new Promise(resolve => setTimeout(resolve, ms));
      return { delayed: ms };
    }
  }
};
```

## 内置 UI 组件设计

### Confirm 组件

```typescript
// packages/editor/src/ui/confirm.tsx
import React from 'react';
import type { UIComponentRegistration, UIMode, UIConfig, Context, UIRenderResult } from '@flowify/core';

/**
 * Confirm 组件 - 确认框
 * 显示消息并等待用户确认
 */
export const confirmComponent: UIComponentRegistration = {
  meta: {
    id: 'confirm',
    name: 'Confirm',
    description: '确认框组件',
    supportedModes: [UIMode.CONFIRM],
    propsSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '标题' },
        message: { type: 'string', description: '消息内容' }
      }
    }
  },
  renderer: {
    render: async (config: UIConfig, context: Context): Promise<UIRenderResult> => {
      // 实际渲染逻辑将在可视化编排器中实现
      // 这里返回模拟结果
      return {
        rendered: true,
        userResponse: { confirmed: true }
      };
    }
  }
};

// React 组件（用于可视化编排器）
export const ConfirmDialog: React.FC<{
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, message, onConfirm, onCancel }) => {
  return (
    <div className="confirm-dialog">
      {title && <h3>{title}</h3>}
      <p>{message}</p>
      <div className="actions">
        <button onClick={onCancel}>取消</button>
        <button onClick={onConfirm}>确认</button>
      </div>
    </div>
  );
};
```

### Select 组件

```typescript
// packages/editor/src/ui/select.tsx
import React from 'react';
import type { UIComponentRegistration, UIMode, UIConfig, Context, UIRenderResult } from '@flowify/core';

/**
 * Select 组件 - 选择器
 * 显示选项列表供用户选择
 */
export const selectComponent: UIComponentRegistration = {
  meta: {
    id: 'select',
    name: 'Select',
    description: '选择器组件',
    supportedModes: [UIMode.SELECT],
    propsSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '标题' },
        options: { 
          type: 'array', 
          items: { type: 'object' },
          description: '选项列表' 
        }
      }
    }
  },
  renderer: {
    render: async (config: UIConfig, context: Context): Promise<UIRenderResult> => {
      // 实际渲染逻辑将在可视化编排器中实现
      const firstOption = config.options?.[0];
      return {
        rendered: true,
        selectedOption: firstOption?.id
      };
    }
  }
};

// React 组件（用于可视化编排器）
export const SelectDialog: React.FC<{
  title?: string;
  options: Array<{ id: string; label: string }>;
  onSelect: (id: string) => void;
}> = ({ title, options, onSelect }) => {
  return (
    <div className="select-dialog">
      {title && <h3>{title}</h3>}
      <ul>
        {options.map(option => (
          <li key={option.id} onClick={() => onSelect(option.id)}>
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

## 代码迁移策略

### 迁移步骤

1. **创建目录结构**：创建 `packages/` 目录和各子包目录
2. **迁移 core**：将 `src/core/` 移动到 `packages/core/src/`
3. **迁移 engine**：将其余模块移动到 `packages/engine/src/`
4. **更新导入路径**：将 `../core` 替换为 `@flowify/core`
5. **创建 editor**：创建 `packages/editor/` 并实现内置工具和 UI
6. **更新示例**：更新 `examples/` 中的导入路径
7. **验证测试**：确保所有测试通过

### 导入路径更新规则

| 原路径 | 新路径 |
|--------|--------|
| `../core` | `@flowify/core` |
| `../core/types` | `@flowify/core` |
| `../core/errors` | `@flowify/core` |
| `workflow-engine` | `@flowify/engine` |

## 测试策略

### 测试配置

根目录 `vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts'],
    globals: true,
  },
});
```

### 测试运行

- `pnpm test` - 运行所有包的测试
- `pnpm --filter @flowify/engine test` - 运行 engine 包的测试

## 正确性属性

### P1: 包依赖正确性
- 验证 @flowify/engine 能正确导入 @flowify/core 的类型
- 验证 @flowify/editor 能正确导入 @flowify/core 和 @flowify/engine

### P2: 构建顺序正确性
- 验证 `pnpm build` 按 core → engine → editor 顺序构建

### P3: 测试通过性
- 验证迁移后所有现有测试通过

### P4: 工具注册正确性
- 验证内置工具能正确注册到引擎并执行

### P5: UI 组件注册正确性
- 验证内置 UI 组件能正确注册到引擎
