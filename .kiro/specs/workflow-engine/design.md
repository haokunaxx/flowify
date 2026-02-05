# 设计文档：工作流引擎

## 概述

本设计文档描述了一个通用工作流引擎的技术架构和实现方案。该引擎采用事件驱动架构，支持 DAG 工作流执行、异步等待、上下文管理、Hook 扩展、UI 组件和工具注入等核心功能。

设计目标：
- 高度可扩展：通过插件化架构支持 UI 组件和工具的动态注入
- 事件驱动：所有状态变化通过事件对外暴露，便于监控和集成
- 类型安全：使用 TypeScript 提供完整的类型定义
- 可视化友好：提供序列化接口支持可视化编排器对接

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        WorkflowEngine                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Scheduler  │  │  Executor   │  │     EventEmitter        │  │
│  │  (调度器)    │  │  (执行器)    │  │     (事件发射器)         │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│  ┌──────▼──────────────────▼──────────────────────▼─────────┐   │
│  │                    Context (上下文)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ToolRegistry │  │ UIRegistry  │  │     HookManager         │  │
│  │ (工具注册表) │  │(UI注册表)   │  │     (Hook管理器)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     External Systems                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  UI Layer   │  │   Tools     │  │     Monitoring          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心组件职责

| 组件 | 职责 |
|------|------|
| WorkflowEngine | 引擎入口，协调各组件工作 |
| Scheduler | DAG 解析、拓扑排序、步骤调度 |
| Executor | 步骤执行、重试、跳过逻辑 |
| Context | 上下文数据存储和访问 |
| EventEmitter | 事件发布和订阅 |
| ToolRegistry | 工具注册和查找 |
| UIRegistry | UI 组件注册和查找 |
| HookManager | Hook 注册和执行 |

## DAG 构建与多分支工作流

### 工作流结构声明

工作流通过 `dependencies` 字段声明步骤之间的依赖关系，引擎根据依赖关系自动构建 DAG 结构。

#### 单分支（线性）工作流示例

```typescript
// 线性工作流：A → B → C
const linearWorkflow: WorkflowDefinition = {
  id: 'linear-workflow',
  name: '线性工作流',
  steps: [
    { id: 'A', name: '步骤A', type: 'task' },
    { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
    { id: 'C', name: '步骤C', type: 'task', dependencies: ['B'] }
  ]
};
```

#### 多分支（并行）工作流示例

```typescript
// 并行工作流：
//     ┌→ B ─┐
// A ──┤     ├→ D
//     └→ C ─┘
const parallelWorkflow: WorkflowDefinition = {
  id: 'parallel-workflow',
  name: '并行工作流',
  steps: [
    { id: 'A', name: '步骤A', type: 'task' },
    { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
    { id: 'C', name: '步骤C', type: 'task', dependencies: ['A'] },
    { id: 'D', name: '步骤D', type: 'task', dependencies: ['B', 'C'] }
  ]
};
```

#### 复杂 DAG 工作流示例

```typescript
// 复杂 DAG：
//     ┌→ B ──→ D ─┐
// A ──┤           ├→ F
//     └→ C ──→ E ─┘
const complexWorkflow: WorkflowDefinition = {
  id: 'complex-workflow',
  name: '复杂DAG工作流',
  steps: [
    { id: 'A', name: '初始化', type: 'task' },
    { id: 'B', name: '分支1-步骤1', type: 'task', dependencies: ['A'] },
    { id: 'C', name: '分支2-步骤1', type: 'task', dependencies: ['A'] },
    { id: 'D', name: '分支1-步骤2', type: 'task', dependencies: ['B'] },
    { id: 'E', name: '分支2-步骤2', type: 'task', dependencies: ['C'] },
    { id: 'F', name: '汇聚', type: 'task', dependencies: ['D', 'E'] }
  ]
};
```

### DAG 构建算法

```typescript
class DAGBuilder {
  /**
   * 从工作流定义构建 DAG
   * 时间复杂度: O(V + E)，V 为步骤数，E 为依赖边数
   */
  build(definition: WorkflowDefinition): DAG {
    const nodes = new Map<string, DAGNode>();
    const edges = new Map<string, string[]>();
    
    // 1. 创建所有节点
    for (const step of definition.steps) {
      nodes.set(step.id, {
        step,
        inDegree: 0,
        outDegree: 0
      });
      edges.set(step.id, step.dependencies || []);
    }
    
    // 2. 计算入度和出度
    for (const step of definition.steps) {
      const deps = step.dependencies || [];
      const node = nodes.get(step.id)!;
      node.inDegree = deps.length;
      
      // 更新被依赖节点的出度
      for (const depId of deps) {
        const depNode = nodes.get(depId);
        if (depNode) {
          depNode.outDegree++;
        }
      }
    }
    
    return { nodes, edges };
  }
  
  /**
   * 检测循环依赖（使用 Kahn 算法）
   * 返回: 如果存在循环，返回循环路径；否则返回 null
   */
  detectCycle(dag: DAG): string[] | null {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const sorted: string[] = [];
    
    // 初始化入度
    for (const [id, node] of dag.nodes) {
      inDegree.set(id, node.inDegree);
      if (node.inDegree === 0) {
        queue.push(id);
      }
    }
    
    // Kahn 算法
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      
      // 找到所有依赖 current 的节点
      for (const [id, deps] of dag.edges) {
        if (deps.includes(current)) {
          const newDegree = inDegree.get(id)! - 1;
          inDegree.set(id, newDegree);
          if (newDegree === 0) {
            queue.push(id);
          }
        }
      }
    }
    
    // 如果排序结果不包含所有节点，说明存在循环
    if (sorted.length !== dag.nodes.size) {
      return this.findCyclePath(dag, sorted);
    }
    
    return null;
  }
  
  /**
   * 获取当前可执行的步骤（入度为 0 且未完成的步骤）
   */
  getReadySteps(dag: DAG, completedSteps: Set<string>): StepDefinition[] {
    const ready: StepDefinition[] = [];
    
    for (const [id, node] of dag.nodes) {
      if (completedSteps.has(id)) continue;
      
      const deps = dag.edges.get(id) || [];
      const allDepsCompleted = deps.every(depId => completedSteps.has(depId));
      
      if (allDepsCompleted) {
        ready.push(node.step);
      }
    }
    
    return ready;
  }
  
  private findCyclePath(dag: DAG, sorted: string[]): string[] {
    // 找出未被排序的节点（这些节点在循环中）
    const inCycle = new Set<string>();
    for (const id of dag.nodes.keys()) {
      if (!sorted.includes(id)) {
        inCycle.add(id);
      }
    }
    
    // 从循环中的任意节点开始，追踪循环路径
    const start = inCycle.values().next().value;
    const path: string[] = [start];
    const visited = new Set<string>([start]);
    
    let current = start;
    while (true) {
      const deps = dag.edges.get(current) || [];
      const nextInCycle = deps.find(d => inCycle.has(d) && !visited.has(d));
      
      if (!nextInCycle) {
        // 回到起点，完成循环
        const backToStart = deps.find(d => d === start);
        if (backToStart) {
          path.push(start);
        }
        break;
      }
      
      path.push(nextInCycle);
      visited.add(nextInCycle);
      current = nextInCycle;
    }
    
    return path;
  }
}
```

### 执行调度流程

```
┌─────────────────────────────────────────────────────────────┐
│                     调度执行流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 解析工作流定义 ──→ 构建 DAG                               │
│           │                                                  │
│           ▼                                                  │
│  2. 验证 DAG（检测循环依赖）                                   │
│           │                                                  │
│           ▼                                                  │
│  3. 初始化：找出所有入度为 0 的步骤（起始步骤）                  │
│           │                                                  │
│           ▼                                                  │
│  ┌───────────────────────────────────────────────────┐      │
│  │  4. 调度循环                                       │      │
│  │     ┌─────────────────────────────────────────┐   │      │
│  │     │ 获取所有可执行步骤（依赖已完成的步骤）     │   │      │
│  │     └─────────────────────────────────────────┘   │      │
│  │                    │                              │      │
│  │                    ▼                              │      │
│  │     ┌─────────────────────────────────────────┐   │      │
│  │     │ 并行执行所有可执行步骤                    │   │      │
│  │     └─────────────────────────────────────────┘   │      │
│  │                    │                              │      │
│  │                    ▼                              │      │
│  │     ┌─────────────────────────────────────────┐   │      │
│  │     │ 更新完成集合，检查是否还有待执行步骤      │   │      │
│  │     └─────────────────────────────────────────┘   │      │
│  │                    │                              │      │
│  │          有待执行步骤 ──→ 继续循环                │      │
│  │          无待执行步骤 ──→ 退出循环                │      │
│  └───────────────────────────────────────────────────┘      │
│           │                                                  │
│           ▼                                                  │
│  5. 工作流完成                                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 条件分支（基于 UI 选择）

除了静态的 DAG 依赖，还支持通过选择型 UI 实现动态分支。

**条件分支的工作原理：**

1. **选择步骤**：一个配置了选择型 UI 的步骤，用户选择后，选择结果存入上下文
2. **分支步骤**：多个依赖选择步骤的后续步骤，每个配置了 `skipPolicy`
3. **跳过判断**：执行分支步骤前，根据上下文中的选择结果计算 `skipPolicy`，不匹配的分支被跳过
4. **汇聚步骤**：依赖所有分支步骤，等待所有分支完成（包括被跳过的）后执行

```
执行流程示意：

用户选择 "快速处理"
        │
        ▼
┌───────────────┐
│  choose 步骤   │  输出: { selectedOption: 'fast' }
└───────┬───────┘
        │
   ┌────┴────┐
   ▼         ▼
┌──────┐  ┌──────┐
│ fast │  │ full │  检查 skipPolicy:
│      │  │      │  - fast: condition 返回 false → 执行
│ 执行  │  │ 跳过  │  - full: condition 返回 true → 跳过
└──┬───┘  └──┬───┘
   │         │
   └────┬────┘
        ▼
┌───────────────┐
│  finish 步骤   │  等待 fast 和 full 都完成（full 是跳过状态）
└───────────────┘
```

```typescript
// 条件分支工作流示例
const conditionalWorkflow: WorkflowDefinition = {
  id: 'conditional-workflow',
  name: '条件分支工作流',
  steps: [
    {
      id: 'choose',
      name: '选择路径',
      type: 'ui',
      ui: {
        componentId: 'choice-dialog',
        mode: UIMode.SELECT,
        data: { message: '请选择处理方式' },
        options: [
          { id: 'fast', label: '快速处理' },
          { id: 'full', label: '完整处理' }
        ]
      }
    },
    {
      id: 'fast-process',
      name: '快速处理',
      type: 'task',
      dependencies: ['choose'],
      // 跳过策略：如果用户没有选择 'fast' 则跳过此步骤
      skipPolicy: {
        condition: (ctx) => ctx.getStepOutput('choose')?.selectedOption !== 'fast',
        defaultOutput: null
      }
    },
    {
      id: 'full-process',
      name: '完整处理',
      type: 'task',
      dependencies: ['choose'],
      // 跳过策略：如果用户没有选择 'full' 则跳过此步骤
      skipPolicy: {
        condition: (ctx) => ctx.getStepOutput('choose')?.selectedOption !== 'full',
        defaultOutput: null
      }
    },
    {
      id: 'finish',
      name: '完成',
      type: 'task',
      dependencies: ['fast-process', 'full-process']
    }
  ]
};
```

**为什么这样设计？**

1. **保持 DAG 结构不变**：条件分支不改变 DAG 的静态结构，只是在运行时通过跳过策略决定哪些步骤实际执行
2. **简化调度逻辑**：调度器不需要处理动态图变化，只需要按照固定的 DAG 调度
3. **可视化友好**：可视化编排器可以展示完整的分支结构，运行时高亮实际执行的路径
4. **状态一致性**：被跳过的步骤也有明确的状态（skipped），便于追踪和调试

**与工具执行的关系：**

选择型 UI 本质上是一种特殊的"工具"，它：
- 发出 UI 渲染事件，等待用户响应
- 用户选择后，响应数据作为步骤输出存入上下文
- 后续步骤可以读取这个输出来决定自己的行为

这与普通工具调用的区别在于：
- 工具调用：引擎调用注册的工具函数，获取返回值
- UI 交互：引擎发出事件，等待外部（UI 层）响应

## 组件与接口

### 核心类型定义

```typescript
// 步骤状态枚举
enum StepStatus {
  PENDING = 'pending',       // 待执行
  RUNNING = 'running',       // 执行中
  WAITING_INPUT = 'waiting_input', // 等待输入
  SUCCESS = 'success',       // 成功
  FAILED = 'failed',         // 失败
  SKIPPED = 'skipped'        // 跳过
}

// 工作流状态枚举
enum WorkflowStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// UI 交互模式
enum UIMode {
  DISPLAY = 'display',   // 展示型：自动继续
  CONFIRM = 'confirm',   // 确认型：等待确认
  SELECT = 'select'      // 选择型：根据选择决定路径
}

// 工具执行模式
enum ToolMode {
  SYNC = 'sync',     // 同步执行
  ASYNC = 'async'    // 异步执行
}
```

### 工作流定义接口

```typescript
// 工作流定义
interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  steps: StepDefinition[];
  globalHooks?: HookDefinition;
}

// 步骤定义
interface StepDefinition {
  id: string;
  name: string;
  type: string;                    // 步骤类型标识
  dependencies?: string[];         // 依赖的步骤 ID 列表
  config?: Record<string, unknown>; // 步骤配置
  retryPolicy?: RetryPolicy;
  skipPolicy?: SkipPolicy;
  hooks?: HookDefinition;
  ui?: UIConfig;
  tools?: ToolInvocation[];
}

// 重试策略
interface RetryPolicy {
  maxRetries: number;              // 最大重试次数
  retryInterval: number;           // 重试间隔（毫秒）
  exponentialBackoff?: boolean;    // 是否启用指数退避
  backoffMultiplier?: number;      // 退避倍数，默认 2
}

// 跳过策略
interface SkipPolicy {
  condition: string | SkipConditionFn; // 跳过条件表达式或函数
  defaultOutput?: unknown;              // 跳过时的默认输出
}

type SkipConditionFn = (context: Context) => boolean;
```

### Hook 接口

```typescript
// Hook 定义
interface HookDefinition {
  beforeHooks?: HookHandler[];
  afterHooks?: HookHandler[];
}

// Hook 处理器
interface HookHandler {
  id: string;
  name: string;
  handler: HookFn;
}

// Hook 函数签名
type HookFn = (hookContext: HookContext) => Promise<void>;

// Hook 上下文
interface HookContext {
  stepId: string;
  stepInput: unknown;
  stepOutput?: unknown;          // 仅 afterHook 可用
  context: Context;
  modifyInput: (newInput: unknown) => void;  // 修改步骤输入
}
```

### UI 组件接口

```typescript
// UI 配置
interface UIConfig {
  componentId: string;           // UI 组件标识
  mode: UIMode;                  // 交互模式
  data?: Record<string, unknown>; // 渲染数据
  timeout?: number;              // 展示型 UI 的自动继续时间（毫秒）
  options?: UISelectOption[];    // 选择型 UI 的选项
}

// 选择型 UI 选项
interface UISelectOption {
  id: string;
  label: string;
  nextStepId?: string;           // 选择后跳转的步骤
  value?: unknown;               // 选项值
}

// UI 组件注册信息
interface UIComponentMeta {
  id: string;
  name: string;
  description?: string;
  supportedModes: UIMode[];
  propsSchema?: JSONSchema;      // 组件属性 Schema
}

// UI 组件渲染器
interface UIRenderer {
  render: (config: UIConfig, context: Context) => Promise<UIRenderResult>;
}

interface UIRenderResult {
  rendered: boolean;
  userResponse?: unknown;
  selectedOption?: string;
}
```

### 工具接口

```typescript
// 工具调用配置
interface ToolInvocation {
  toolId: string;
  params?: Record<string, unknown>;
  outputKey?: string;            // 输出存储到上下文的 key
}

// 工具注册信息
interface ToolMeta {
  id: string;
  name: string;
  description?: string;
  mode: ToolMode;
  inputSchema?: JSONSchema;
  outputSchema?: JSONSchema;
  timeout?: number;              // 执行超时（毫秒）
}

// 工具执行器
interface ToolExecutor {
  execute: (params: unknown, context: Context) => Promise<unknown>;
}

// 工具注册项
interface ToolRegistration {
  meta: ToolMeta;
  executor: ToolExecutor;
}
```

### 上下文接口

```typescript
// 执行上下文
interface Context {
  workflowId: string;
  instanceId: string;
  
  // 步骤输出管理
  getStepOutput: (stepId: string) => unknown;
  setStepOutput: (stepId: string, output: unknown) => void;
  
  // 全局变量管理
  getGlobal: (key: string) => unknown;
  setGlobal: (key: string, value: unknown) => void;
  
  // 获取所有数据快照
  snapshot: () => ContextSnapshot;
}

interface ContextSnapshot {
  stepOutputs: Record<string, unknown>;
  globals: Record<string, unknown>;
}
```

### 事件接口

```typescript
// 事件类型枚举
enum EventType {
  // 工作流级别事件
  WORKFLOW_START = 'workflow:start',
  WORKFLOW_COMPLETE = 'workflow:complete',
  WORKFLOW_FAILED = 'workflow:failed',
  
  // 步骤级别事件
  STEP_START = 'step:start',
  STEP_COMPLETE = 'step:complete',
  STEP_FAILED = 'step:failed',
  STEP_RETRY = 'step:retry',
  STEP_SKIP = 'step:skip',
  
  // 进度事件
  PROGRESS_UPDATE = 'progress:update',
  STEP_BAR_UPDATE = 'stepbar:update',
  
  // UI 事件
  UI_RENDER = 'ui:render',
  UI_RESPONSE = 'ui:response',
  
  // 工具事件
  TOOL_INVOKE = 'tool:invoke',
  TOOL_COMPLETE = 'tool:complete',
  TOOL_FAILED = 'tool:failed',
  
  // 等待事件
  WAIT_START = 'wait:start',
  WAIT_TIMEOUT = 'wait:timeout',
  WAIT_RESUME = 'wait:resume',
  WAIT_CANCEL = 'wait:cancel'
}

// 基础事件结构
interface WorkflowEvent<T = unknown> {
  type: EventType;
  timestamp: number;
  workflowId: string;
  instanceId: string;
  stepId?: string;
  payload: T;
}

// 进度事件负载
interface ProgressPayload {
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  percentage: number;
}

// 步骤条事件负载
interface StepBarPayload {
  steps: StepBarItem[];
  activeStepId: string;
}

interface StepBarItem {
  id: string;
  name: string;
  status: StepStatus;
}
```

### 调度器接口

```typescript
// 调度器
interface Scheduler {
  // 解析工作流定义，构建 DAG
  parse: (definition: WorkflowDefinition) => DAG;
  
  // 验证 DAG 无循环依赖
  validate: (dag: DAG) => ValidationResult;
  
  // 获取下一批可执行的步骤
  getReadySteps: (dag: DAG, completedSteps: Set<string>) => StepDefinition[];
  
  // 获取拓扑排序结果
  topologicalSort: (dag: DAG) => string[];
}

// DAG 结构
interface DAG {
  nodes: Map<string, DAGNode>;
  edges: Map<string, string[]>;  // stepId -> 依赖的 stepId 列表
}

interface DAGNode {
  step: StepDefinition;
  inDegree: number;              // 入度（依赖数量）
  outDegree: number;             // 出度（被依赖数量）
}

interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
```

### 执行器接口

```typescript
// 执行器
interface Executor {
  // 执行单个步骤
  executeStep: (step: StepDefinition, context: Context) => Promise<StepResult>;
  
  // 取消步骤执行
  cancelStep: (stepId: string) => Promise<void>;
}

// 步骤执行结果
interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: unknown;
  error?: Error;
  retryCount?: number;
}
```

### 引擎主接口

```typescript
// 工作流引擎
interface IWorkflowEngine {
  // 工作流管理
  loadWorkflow: (definition: WorkflowDefinition) => void;
  start: (initialContext?: Record<string, unknown>) => Promise<WorkflowResult>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  
  // 注册表管理
  registerTool: (registration: ToolRegistration) => void;
  unregisterTool: (toolId: string) => void;
  registerUIComponent: (meta: UIComponentMeta, renderer: UIRenderer) => void;
  unregisterUIComponent: (componentId: string) => void;
  
  // Hook 管理
  addGlobalHook: (type: 'before' | 'after', handler: HookHandler) => void;
  removeGlobalHook: (hookId: string) => void;
  
  // 事件管理
  on: (eventType: EventType, listener: EventListener) => void;
  off: (eventType: EventType, listener: EventListener) => void;
  
  // 外部响应
  respondToUI: (stepId: string, response: UIRenderResult) => void;
  respondToTool: (stepId: string, toolId: string, result: unknown) => void;
  
  // 查询接口
  getStatus: () => WorkflowStatus;
  getContext: () => Context;
  getStepBarState: () => StepBarPayload;
  
  // 序列化
  exportDefinition: () => string;
  importDefinition: (json: string) => void;
  
  // 元数据查询
  getRegisteredTools: () => ToolMeta[];
  getRegisteredUIComponents: () => UIComponentMeta[];
}

type EventListener = (event: WorkflowEvent) => void;

interface WorkflowResult {
  status: WorkflowStatus;
  context: ContextSnapshot;
  error?: Error;
}
```

## 数据模型

### 工作流实例状态

```typescript
// 工作流运行时状态
interface WorkflowInstance {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  definition: WorkflowDefinition;
  dag: DAG;
  context: Context;
  stepStates: Map<string, StepState>;
  startTime: number;
  endTime?: number;
}

// 步骤运行时状态
interface StepState {
  stepId: string;
  status: StepStatus;
  retryCount: number;
  startTime?: number;
  endTime?: number;
  error?: Error;
  waitingFor?: WaitingInfo;
}

// 等待信息
interface WaitingInfo {
  type: 'ui' | 'tool';
  id: string;                    // UI 组件 ID 或工具 ID
  startTime: number;
  timeout?: number;
}
```

### JSON Schema 类型

```typescript
// 简化的 JSON Schema 定义
interface JSONSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
}
```


## 错误处理

### 错误类型层次

```typescript
// 基础工作流错误
class WorkflowError extends Error {
  constructor(
    message: string,
    public code: string,
    public workflowId?: string,
    public stepId?: string
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

// 验证错误：工作流定义无效
class ValidationError extends WorkflowError {
  constructor(message: string, public details: string[]) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// 循环依赖错误
class CyclicDependencyError extends ValidationError {
  constructor(public cycle: string[]) {
    super(`检测到循环依赖: ${cycle.join(' -> ')}`, [cycle.join(' -> ')]);
    this.name = 'CyclicDependencyError';
  }
}

// 步骤执行错误
class StepExecutionError extends WorkflowError {
  constructor(
    message: string,
    stepId: string,
    public originalError?: Error
  ) {
    super(message, 'STEP_EXECUTION_ERROR', undefined, stepId);
    this.name = 'StepExecutionError';
  }
}

// 工具未找到错误
class ToolNotFoundError extends WorkflowError {
  constructor(public toolId: string) {
    super(`工具未注册: ${toolId}`, 'TOOL_NOT_FOUND');
    this.name = 'ToolNotFoundError';
  }
}

// UI 组件未找到错误
class UIComponentNotFoundError extends WorkflowError {
  constructor(public componentId: string) {
    super(`UI 组件未注册: ${componentId}`, 'UI_COMPONENT_NOT_FOUND');
    this.name = 'UIComponentNotFoundError';
  }
}

// 超时错误
class TimeoutError extends WorkflowError {
  constructor(
    message: string,
    stepId: string,
    public timeoutMs: number
  ) {
    super(message, 'TIMEOUT_ERROR', undefined, stepId);
    this.name = 'TimeoutError';
  }
}

// Hook 执行错误
class HookExecutionError extends WorkflowError {
  constructor(
    public hookId: string,
    public hookType: 'before' | 'after',
    stepId: string,
    public originalError?: Error
  ) {
    super(`Hook 执行失败: ${hookId}`, 'HOOK_EXECUTION_ERROR', undefined, stepId);
    this.name = 'HookExecutionError';
  }
}
```

### 错误处理策略

| 错误类型 | 处理策略 |
|---------|---------|
| ValidationError | 阻止工作流启动，返回详细错误信息 |
| CyclicDependencyError | 阻止工作流启动，返回循环路径 |
| StepExecutionError | 根据重试策略决定重试或标记失败 |
| ToolNotFoundError | 立即标记步骤失败 |
| UIComponentNotFoundError | 立即标记步骤失败 |
| TimeoutError | 触发超时事件，执行超时处理策略 |
| HookExecutionError | beforeHook 失败阻止步骤执行，afterHook 失败记录但不影响步骤结果 |

## 测试策略

### 测试方法

本项目采用双重测试策略：
- **单元测试**：验证具体示例、边界情况和错误条件
- **属性测试**：验证跨所有输入的通用属性

### 测试框架

- 单元测试：Vitest
- 属性测试：fast-check
- 每个属性测试最少运行 100 次迭代

### 测试覆盖范围

| 组件 | 单元测试重点 | 属性测试重点 |
|------|-------------|-------------|
| Scheduler | 拓扑排序、循环检测 | DAG 验证属性 |
| Executor | 重试逻辑、跳过逻辑 | 状态转换属性 |
| Context | 数据存取 | 上下文隔离属性 |
| EventEmitter | 事件发布订阅 | 事件顺序属性 |
| ToolRegistry | 注册查找 | 注册一致性属性 |
| UIRegistry | 注册查找 | 注册一致性属性 |
| HookManager | Hook 执行顺序 | Hook 执行顺序属性 |


## 正确性属性

*正确性属性是一种应该在系统所有有效执行中保持为真的特征或行为——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规格和机器可验证正确性保证之间的桥梁。*

### Property 1: DAG 验证与循环检测

*对于任意* 工作流定义，如果定义中存在循环依赖，则验证函数应返回包含循环路径的错误；如果不存在循环依赖，则验证函数应返回有效结果。

**Validates: Requirements 1.3, 1.4**

### Property 2: 拓扑排序正确性

*对于任意* 有效的 DAG 工作流定义，拓扑排序结果中的每个步骤都应该出现在其所有依赖步骤之后。

**Validates: Requirements 2.1**

### Property 3: 步骤调度依赖完整性

*对于任意* DAG 工作流和任意步骤，当且仅当该步骤的所有前置依赖都已完成时，该步骤才应被标记为可执行。

**Validates: Requirements 2.2**

### Property 4: 失败传播阻断

*对于任意* 工作流执行，当某个步骤执行失败时，其所有后续依赖步骤都不应被执行。

**Validates: Requirements 2.4**

### Property 5: 事件结构完整性

*对于任意* 引擎发出的事件，该事件都应包含事件类型、工作流 ID、实例 ID、时间戳和负载数据。

**Validates: Requirements 3.6**

### Property 6: 事件监听器广播

*对于任意* 注册的事件监听器集合和任意发出的事件，所有监听器都应收到该事件。

**Validates: Requirements 3.5**

### Property 7: 异步等待非阻塞

*对于任意* 包含等待步骤和非等待步骤的并行工作流，等待步骤进入等待状态时不应阻塞其他独立步骤的执行。

**Validates: Requirements 4.1**

### Property 8: 上下文实例隔离

*对于任意* 两个并行执行的工作流实例，一个实例的上下文修改不应影响另一个实例的上下文数据。

**Validates: Requirements 6.1**

### Property 9: 上下文数据流正确性

*对于任意* 有依赖关系的步骤序列，后续步骤执行时应能访问到其所有依赖步骤的输出数据。

**Validates: Requirements 6.2, 6.3, 6.4**

### Property 10: 全局变量读写一致性

*对于任意* 全局变量的写入操作，后续的读取操作应返回最后写入的值。

**Validates: Requirements 6.5**

### Property 11: 重试次数限制

*对于任意* 配置了重试策略的步骤，实际重试次数不应超过配置的最大重试次数。

**Validates: Requirements 7.2, 7.5, 7.7**

### Property 12: 指数退避间隔

*对于任意* 配置了指数退避的重试策略，第 N 次重试的间隔应等于基础间隔乘以退避倍数的 (N-1) 次方。

**Validates: Requirements 7.4**

### Property 13: 跳过条件判断正确性

*对于任意* 配置了跳过策略的步骤和任意上下文状态，当跳过条件为真时步骤应被跳过，当跳过条件为假时步骤应正常执行。

**Validates: Requirements 8.2, 8.3, 8.4**

### Property 14: 跳过后继续执行

*对于任意* 被跳过的步骤，其后续依赖步骤应继续执行（假设没有其他阻断条件）。

**Validates: Requirements 8.6**

### Property 15: 跳过默认输出

*对于任意* 配置了默认输出的跳过策略，当步骤被跳过时，上下文中该步骤的输出应等于配置的默认值。

**Validates: Requirements 8.7**

### Property 16: Hook 执行顺序

*对于任意* 同时配置了全局 Hook 和步骤级 Hook 的步骤执行，执行顺序应为：全局 beforeHook → 步骤 beforeHook → 步骤执行 → 步骤 afterHook → 全局 afterHook。

**Validates: Requirements 9.2, 9.3, 9.7, 9.8**

### Property 17: Hook 输入修改传递

*对于任意* 在 beforeHook 中修改输入的操作，步骤执行时应收到修改后的输入。

**Validates: Requirements 9.4**

### Property 18: beforeHook 失败阻断

*对于任意* beforeHook 执行失败的情况，对应的步骤不应被执行。

**Validates: Requirements 9.6**

### Property 19: 工具注册查找一致性

*对于任意* 注册的工具，通过其标识符查找应返回该工具；对于未注册的标识符，查找应返回错误。

**Validates: Requirements 11.2, 11.7, 11.8**

### Property 20: 工具 Schema 验证

*对于任意* 定义了输入 Schema 的工具和任意输入参数，当参数不符合 Schema 时应拒绝执行。

**Validates: Requirements 11.13**

### Property 21: 工作流定义序列化 Round-Trip

*对于任意* 有效的工作流定义，序列化为 JSON 后再反序列化应产生等价的工作流定义。

**Validates: Requirements 12.1, 12.2, 12.3**

### Property 22: 注册表查询完整性

*对于任意* 注册的工具/UI 组件/步骤类型集合，查询接口应返回所有已注册项。

**Validates: Requirements 12.4, 12.5, 12.6**

### Property 23: 步骤条状态同步

*对于任意* 步骤状态变化，应立即发出包含所有步骤当前状态和活动步骤标识的步骤条更新事件。

**Validates: Requirements 13.1, 13.2, 13.3, 13.4**

### Property 24: 进度事件准确性

*对于任意* 进度事件，已完成步骤数加上待执行步骤数应等于总步骤数，且百分比应等于已完成步骤数除以总步骤数。

**Validates: Requirements 5.2**

### Property 25: 工作流生命周期事件

*对于任意* 工作流执行，应在开始时发出开始事件，在成功完成时发出完成事件，在失败时发出包含错误信息的失败事件。

**Validates: Requirements 5.3, 5.4, 5.5**


## 可视化编排引擎对接方案

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        可视化编排引擎                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │   画布组件        │  │   节点面板        │  │   属性面板            │   │
│  │   (Canvas)       │  │   (NodePanel)    │  │   (PropertyPanel)    │   │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘   │
│           │                     │                        │              │
│           └─────────────────────┼────────────────────────┘              │
│                                 │                                        │
│                                 ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    编排状态管理 (EditorState)                      │   │
│  │  - 节点列表 (nodes)                                               │   │
│  │  - 连线列表 (edges)                                               │   │
│  │  - 选中状态 (selection)                                           │   │
│  │  - 撤销/重做栈 (history)                                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                 │                                        │
│                                 ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    转换层 (Transformer)                           │   │
│  │  - toWorkflowDefinition(): 编排数据 → WorkflowDefinition          │   │
│  │  - fromWorkflowDefinition(): WorkflowDefinition → 编排数据        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        WorkflowEngine                                    │
│  - loadWorkflow()                                                        │
│  - getRegisteredTools()                                                  │
│  - getRegisteredUIComponents()                                           │
│  - exportDefinition() / importDefinition()                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 编排数据模型

```typescript
// 可视化编排器的内部数据模型
interface EditorState {
  nodes: EditorNode[];
  edges: EditorEdge[];
  viewport: Viewport;
  selection: Selection;
}

// 编排器节点（包含位置信息）
interface EditorNode {
  id: string;
  type: NodeType;
  position: Position;           // 画布上的位置
  data: NodeData;               // 节点配置数据
  ports: NodePorts;             // 连接端口
}

interface Position {
  x: number;
  y: number;
}

interface NodePorts {
  inputs: Port[];               // 输入端口（依赖）
  outputs: Port[];              // 输出端口（被依赖）
}

interface Port {
  id: string;
  name: string;
  connected: boolean;
}

// 节点类型
enum NodeType {
  // 基础节点
  START = 'start',              // 开始节点
  END = 'end',                  // 结束节点
  TASK = 'task',                // 任务节点
  
  // 控制流节点
  CONDITION = 'condition',      // 条件分支节点
  PARALLEL = 'parallel',        // 并行网关节点
  MERGE = 'merge',              // 合并网关节点
  
  // 交互节点
  UI = 'ui',                    // UI 交互节点
  TOOL = 'tool',                // 工具调用节点
}

// 节点数据（根据类型不同而不同）
type NodeData = 
  | TaskNodeData 
  | ConditionNodeData 
  | UINodeData 
  | ToolNodeData;

interface TaskNodeData {
  name: string;
  description?: string;
  retryPolicy?: RetryPolicy;
  skipPolicy?: SkipPolicyConfig;
  hooks?: HookConfig;
}

interface ConditionNodeData {
  name: string;
  branches: ConditionBranch[];
}

interface ConditionBranch {
  id: string;
  label: string;
  condition: string;            // 条件表达式
  targetNodeId?: string;        // 目标节点（由连线决定）
}

interface UINodeData {
  name: string;
  componentId: string;
  mode: UIMode;
  config: Record<string, unknown>;
}

interface ToolNodeData {
  name: string;
  toolId: string;
  params: Record<string, unknown>;
  outputKey?: string;
}

// 编排器连线
interface EditorEdge {
  id: string;
  source: string;               // 源节点 ID
  sourcePort: string;           // 源端口 ID
  target: string;               // 目标节点 ID
  targetPort: string;           // 目标端口 ID
  label?: string;               // 连线标签（用于条件分支）
  condition?: string;           // 条件表达式（用于条件分支）
}
```

### 条件分支的可视化表示

```
┌─────────────────────────────────────────────────────────────────┐
│                    条件分支可视化方案                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  【可视化编排器中的表示】                                         │
│                                                                  │
│         ┌─────────┐                                              │
│         │  开始    │                                              │
│         └────┬────┘                                              │
│              │                                                   │
│              ▼                                                   │
│         ┌─────────┐                                              │
│         │ 条件判断 │  ← 条件节点（菱形）                          │
│         │         │    配置: evaluator 函数                      │
│         └────┬────┘    返回: 'fast' | 'full' | 'default'        │
│              │                                                   │
│      ┌───────┼───────┐                                           │
│      │       │       │                                           │
│   [fast]  [full]  [default]  ← 连线上的条件标签                  │
│      │       │       │                                           │
│      ▼       ▼       ▼                                           │
│  ┌──────┐┌──────┐┌──────┐                                        │
│  │分支A ││分支B ││分支C │                                        │
│  └──┬───┘└──┬───┘└──┬───┘                                        │
│     │       │       │                                            │
│     └───────┼───────┘                                            │
│             ▼                                                    │
│         ┌─────────┐                                              │
│         │  合并    │                                              │
│         └─────────┘                                              │
│                                                                  │
│  【转换为 WorkflowDefinition 后】                                 │
│                                                                  │
│  条件节点 → 执行 evaluator 函数，结果存入上下文                   │
│  分支节点 → 各自带有 skipPolicy，根据条件节点输出判断是否跳过     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**条件节点的工作原理：**

1. **条件节点配置**：用户在条件节点中编写 JS 表达式或函数，返回一个分支标识
2. **连线条件标签**：每条从条件节点出发的连线带有一个标签，表示"当返回值等于此标签时走这条路"
3. **转换时生成 skipPolicy**：转换层自动为每个分支节点生成 skipPolicy

```typescript
// 条件节点的配置数据
interface ConditionNodeData {
  name: string;
  // 条件计算器：一个 JS 表达式或函数，返回分支标识
  evaluator: string;  // 例如: "ctx.getGlobal('userType')" 或 "(ctx) => ctx.getStepOutput('step1').score > 80 ? 'pass' : 'fail'"
}

// 连线上的条件配置
interface EditorEdge {
  id: string;
  source: string;
  target: string;
  // 当条件节点的 evaluator 返回值等于此 label 时，走这条连线
  conditionLabel?: string;  // 例如: 'fast', 'full', 'pass', 'fail'
}
```

**转换逻辑详解：**

```typescript
class WorkflowTransformer {
  /**
   * 处理条件节点及其分支
   * 
   * 输入（编排器数据）:
   * - 条件节点: { id: 'cond1', type: 'condition', data: { evaluator: "ctx.getGlobal('mode')" } }
   * - 连线1: { source: 'cond1', target: 'branch-fast', conditionLabel: 'fast' }
   * - 连线2: { source: 'cond1', target: 'branch-full', conditionLabel: 'full' }
   * 
   * 输出（WorkflowDefinition）:
   * - 条件步骤: { id: 'cond1', type: 'condition', config: { evaluator: "..." } }
   *   执行时：运行 evaluator，将结果存入上下文 ctx.setStepOutput('cond1', { result: 'fast' })
   * 
   * - 分支步骤A: { id: 'branch-fast', dependencies: ['cond1'], 
   *               skipPolicy: { condition: "ctx.getStepOutput('cond1').result !== 'fast'" } }
   * 
   * - 分支步骤B: { id: 'branch-full', dependencies: ['cond1'],
   *               skipPolicy: { condition: "ctx.getStepOutput('cond1').result !== 'full'" } }
   */
  private processConditionNode(
    condNode: EditorNode,
    edges: EditorEdge[],
    allNodes: EditorNode[]
  ): StepDefinition[] {
    const steps: StepDefinition[] = [];
    const condData = condNode.data as ConditionNodeData;
    
    // 1. 生成条件步骤本身
    const condStep: StepDefinition = {
      id: condNode.id,
      name: condData.name,
      type: 'condition',
      config: {
        evaluator: condData.evaluator
      }
    };
    steps.push(condStep);
    
    // 2. 找到所有从条件节点出发的连线
    const branchEdges = edges.filter(e => e.source === condNode.id && e.conditionLabel);
    
    // 3. 为每个分支目标节点生成 skipPolicy
    for (const edge of branchEdges) {
      const targetNode = allNodes.find(n => n.id === edge.target);
      if (!targetNode) continue;
      
      // 生成 skipPolicy：当条件节点的输出不等于此连线的 label 时跳过
      const skipCondition = `ctx.getStepOutput('${condNode.id}').result !== '${edge.conditionLabel}'`;
      
      // 这个 skipPolicy 会被附加到目标节点的步骤定义上
      this.pendingSkipPolicies.set(edge.target, {
        condition: skipCondition,
        defaultOutput: null
      });
    }
    
    return steps;
  }
  
  /**
   * 将节点转换为步骤时，附加之前生成的 skipPolicy
   */
  private nodeToStep(node: EditorNode, edges: EditorEdge[]): StepDefinition {
    const step: StepDefinition = {
      id: node.id,
      name: node.data.name,
      type: this.mapNodeType(node.type),
      dependencies: this.getDependencies(node.id, edges)
    };
    
    // 如果有待附加的 skipPolicy，添加到步骤定义
    const pendingSkip = this.pendingSkipPolicies.get(node.id);
    if (pendingSkip) {
      step.skipPolicy = pendingSkip;
      this.pendingSkipPolicies.delete(node.id);
    }
    
    return step;
  }
}
```

**完整示例：**

```typescript
// 编排器中的数据
const editorState: EditorState = {
  nodes: [
    { id: 'start', type: NodeType.START, ... },
    { 
      id: 'check-mode', 
      type: NodeType.CONDITION, 
      data: { 
        name: '检查处理模式',
        evaluator: "ctx.getGlobal('processingMode')"  // 返回 'fast' 或 'full'
      }
    },
    { id: 'fast-process', type: NodeType.TASK, data: { name: '快速处理' } },
    { id: 'full-process', type: NodeType.TASK, data: { name: '完整处理' } },
    { id: 'finish', type: NodeType.TASK, data: { name: '完成' } },
    { id: 'end', type: NodeType.END, ... }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'check-mode' },
    { id: 'e2', source: 'check-mode', target: 'fast-process', conditionLabel: 'fast' },
    { id: 'e3', source: 'check-mode', target: 'full-process', conditionLabel: 'full' },
    { id: 'e4', source: 'fast-process', target: 'finish' },
    { id: 'e5', source: 'full-process', target: 'finish' },
    { id: 'e6', source: 'finish', target: 'end' }
  ]
};

// 转换后的 WorkflowDefinition
const workflowDefinition: WorkflowDefinition = {
  id: 'workflow-1',
  name: '条件分支示例',
  steps: [
    {
      id: 'check-mode',
      name: '检查处理模式',
      type: 'condition',
      config: {
        evaluator: "ctx.getGlobal('processingMode')"
      }
      // 执行时：result = eval(evaluator)，然后 ctx.setStepOutput('check-mode', { result })
    },
    {
      id: 'fast-process',
      name: '快速处理',
      type: 'task',
      dependencies: ['check-mode'],
      // 转换层自动生成的 skipPolicy
      skipPolicy: {
        condition: "ctx.getStepOutput('check-mode').result !== 'fast'",
        defaultOutput: null
      }
    },
    {
      id: 'full-process',
      name: '完整处理',
      type: 'task',
      dependencies: ['check-mode'],
      // 转换层自动生成的 skipPolicy
      skipPolicy: {
        condition: "ctx.getStepOutput('check-mode').result !== 'full'",
        defaultOutput: null
      }
    },
    {
      id: 'finish',
      name: '完成',
      type: 'task',
      dependencies: ['fast-process', 'full-process']
    }
  ]
};
```

**执行流程：**

```
1. 执行 check-mode 步骤
   - 运行 evaluator: ctx.getGlobal('processingMode') → 'fast'
   - 存入上下文: ctx.setStepOutput('check-mode', { result: 'fast' })

2. 调度 fast-process 和 full-process（它们的依赖 check-mode 已完成）

3. 执行 fast-process 前检查 skipPolicy
   - 计算: ctx.getStepOutput('check-mode').result !== 'fast' → false
   - 不跳过，正常执行

4. 执行 full-process 前检查 skipPolicy
   - 计算: ctx.getStepOutput('check-mode').result !== 'full' → true
   - 跳过，标记为 SKIPPED 状态

5. 调度 finish（依赖 fast-process 和 full-process 都已完成）
   - 正常执行
```

### 转换层实现

```typescript
class WorkflowTransformer {
  /**
   * 将编排器数据转换为 WorkflowDefinition
   */
  toWorkflowDefinition(editorState: EditorState): WorkflowDefinition {
    const steps: StepDefinition[] = [];
    
    for (const node of editorState.nodes) {
      // 跳过开始和结束节点（它们是可视化辅助）
      if (node.type === NodeType.START || node.type === NodeType.END) {
        continue;
      }
      
      const step = this.nodeToStep(node, editorState.edges);
      steps.push(step);
    }
    
    return {
      id: generateId(),
      name: 'Workflow',
      steps
    };
  }
  
  /**
   * 将单个节点转换为步骤定义
   */
  private nodeToStep(node: EditorNode, edges: EditorEdge[]): StepDefinition {
    // 找到所有指向此节点的连线，提取依赖
    const dependencies = edges
      .filter(e => e.target === node.id)
      .map(e => e.source)
      .filter(id => !this.isControlNode(id)); // 排除控制节点
    
    const baseStep: StepDefinition = {
      id: node.id,
      name: node.data.name,
      type: this.mapNodeType(node.type),
      dependencies: dependencies.length > 0 ? dependencies : undefined
    };
    
    // 根据节点类型添加特定配置
    switch (node.type) {
      case NodeType.CONDITION:
        return this.handleConditionNode(node, edges, baseStep);
      case NodeType.UI:
        return this.handleUINode(node, baseStep);
      case NodeType.TOOL:
        return this.handleToolNode(node, baseStep);
      default:
        return baseStep;
    }
  }
  
  /**
   * 处理条件节点：生成带 skipPolicy 的分支步骤
   */
  private handleConditionNode(
    node: EditorNode, 
    edges: EditorEdge[], 
    baseStep: StepDefinition
  ): StepDefinition {
    const data = node.data as ConditionNodeData;
    
    // 条件节点本身转换为 UI 选择步骤或表达式计算步骤
    return {
      ...baseStep,
      type: 'condition',
      config: {
        branches: data.branches
      }
    };
  }
  
  /**
   * 为条件分支的目标节点生成 skipPolicy
   */
  generateSkipPolicies(
    conditionNodeId: string, 
    edges: EditorEdge[]
  ): Map<string, SkipPolicy> {
    const policies = new Map<string, SkipPolicy>();
    
    // 找到从条件节点出发的所有连线
    const branchEdges = edges.filter(e => e.source === conditionNodeId);
    
    for (const edge of branchEdges) {
      if (edge.condition) {
        // 生成跳过策略：当条件不满足时跳过
        policies.set(edge.target, {
          condition: `!(${edge.condition})`,
          defaultOutput: null
        });
      }
    }
    
    return policies;
  }
  
  /**
   * 将 WorkflowDefinition 转换为编排器数据
   */
  fromWorkflowDefinition(definition: WorkflowDefinition): EditorState {
    const nodes: EditorNode[] = [];
    const edges: EditorEdge[] = [];
    
    // 使用自动布局算法计算节点位置
    const layout = this.calculateLayout(definition);
    
    for (const step of definition.steps) {
      const node = this.stepToNode(step, layout.get(step.id)!);
      nodes.push(node);
      
      // 根据依赖关系生成连线
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          edges.push({
            id: `${depId}-${step.id}`,
            source: depId,
            sourcePort: 'output',
            target: step.id,
            targetPort: 'input'
          });
        }
      }
    }
    
    // 添加开始和结束节点
    nodes.unshift(this.createStartNode(layout));
    nodes.push(this.createEndNode(layout));
    
    return {
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      selection: { nodeIds: [], edgeIds: [] }
    };
  }
  
  /**
   * 自动布局算法（基于 DAG 层次布局）
   */
  private calculateLayout(definition: WorkflowDefinition): Map<string, Position> {
    const positions = new Map<string, Position>();
    
    // 1. 计算每个节点的层级（拓扑排序）
    const levels = this.calculateLevels(definition);
    
    // 2. 在每个层级内水平排列节点
    const levelGroups = this.groupByLevel(definition.steps, levels);
    
    const LEVEL_HEIGHT = 120;
    const NODE_WIDTH = 180;
    const PADDING = 50;
    
    for (const [level, steps] of levelGroups) {
      const totalWidth = steps.length * NODE_WIDTH + (steps.length - 1) * PADDING;
      let x = -totalWidth / 2;
      
      for (const step of steps) {
        positions.set(step.id, {
          x: x + NODE_WIDTH / 2,
          y: level * LEVEL_HEIGHT
        });
        x += NODE_WIDTH + PADDING;
      }
    }
    
    return positions;
  }
}
```

### 节点面板设计

```typescript
// 节点面板：展示可拖拽的节点类型
interface NodePanelConfig {
  categories: NodeCategory[];
}

interface NodeCategory {
  id: string;
  name: string;
  items: NodeTemplate[];
}

interface NodeTemplate {
  type: NodeType;
  name: string;
  icon: string;
  description: string;
  defaultData: Partial<NodeData>;
}

// 从引擎获取可用的工具和 UI 组件，动态生成节点模板
class NodePanelBuilder {
  constructor(private engine: IWorkflowEngine) {}
  
  build(): NodePanelConfig {
    return {
      categories: [
        {
          id: 'basic',
          name: '基础节点',
          items: [
            { type: NodeType.TASK, name: '任务', icon: '📋', description: '执行一个任务', defaultData: {} },
            { type: NodeType.CONDITION, name: '条件', icon: '🔀', description: '条件分支', defaultData: {} },
            { type: NodeType.PARALLEL, name: '并行', icon: '⚡', description: '并行执行', defaultData: {} },
            { type: NodeType.MERGE, name: '合并', icon: '🔗', description: '合并分支', defaultData: {} },
          ]
        },
        {
          id: 'ui',
          name: 'UI 组件',
          items: this.buildUINodeTemplates()
        },
        {
          id: 'tools',
          name: '工具',
          items: this.buildToolNodeTemplates()
        }
      ]
    };
  }
  
  private buildUINodeTemplates(): NodeTemplate[] {
    const uiComponents = this.engine.getRegisteredUIComponents();
    return uiComponents.map(comp => ({
      type: NodeType.UI,
      name: comp.name,
      icon: '🖼️',
      description: comp.description || '',
      defaultData: {
        componentId: comp.id,
        mode: comp.supportedModes[0]
      }
    }));
  }
  
  private buildToolNodeTemplates(): NodeTemplate[] {
    const tools = this.engine.getRegisteredTools();
    return tools.map(tool => ({
      type: NodeType.TOOL,
      name: tool.name,
      icon: '🔧',
      description: tool.description || '',
      defaultData: {
        toolId: tool.id
      }
    }));
  }
}
```

### 属性面板设计

```typescript
// 属性面板：编辑选中节点的配置
interface PropertyPanelProps {
  selectedNode: EditorNode | null;
  onUpdate: (nodeId: string, data: Partial<NodeData>) => void;
}

// 根据节点类型动态渲染不同的属性表单
class PropertyPanelRenderer {
  constructor(private engine: IWorkflowEngine) {}
  
  getFormSchema(node: EditorNode): JSONSchema {
    switch (node.type) {
      case NodeType.TASK:
        return this.getTaskFormSchema();
      case NodeType.UI:
        return this.getUIFormSchema(node.data as UINodeData);
      case NodeType.TOOL:
        return this.getToolFormSchema(node.data as ToolNodeData);
      case NodeType.CONDITION:
        return this.getConditionFormSchema();
      default:
        return { type: 'object', properties: {} };
    }
  }
  
  private getToolFormSchema(data: ToolNodeData): JSONSchema {
    // 从引擎获取工具的输入 Schema
    const tools = this.engine.getRegisteredTools();
    const tool = tools.find(t => t.id === data.toolId);
    
    return {
      type: 'object',
      properties: {
        name: { type: 'string', description: '节点名称' },
        toolId: { 
          type: 'string', 
          description: '工具',
          enum: tools.map(t => t.id)
        },
        params: tool?.inputSchema || { type: 'object' },
        outputKey: { type: 'string', description: '输出变量名' }
      },
      required: ['name', 'toolId']
    };
  }
}
```

### 运行时状态可视化

```typescript
// 运行时状态同步：监听引擎事件，更新画布节点状态
class RuntimeVisualizer {
  private nodeStates = new Map<string, StepStatus>();
  
  constructor(
    private engine: IWorkflowEngine,
    private updateNodeStyle: (nodeId: string, status: StepStatus) => void
  ) {
    this.bindEvents();
  }
  
  private bindEvents() {
    // 监听步骤条状态更新事件
    this.engine.on(EventType.STEP_BAR_UPDATE, (event) => {
      const payload = event.payload as StepBarPayload;
      
      for (const step of payload.steps) {
        const prevStatus = this.nodeStates.get(step.id);
        if (prevStatus !== step.status) {
          this.nodeStates.set(step.id, step.status);
          this.updateNodeStyle(step.id, step.status);
        }
      }
      
      // 高亮当前活动节点
      this.highlightActiveNode(payload.activeStepId);
    });
  }
  
  // 节点状态对应的视觉样式
  getNodeStyle(status: StepStatus): NodeStyle {
    const styles: Record<StepStatus, NodeStyle> = {
      [StepStatus.PENDING]: { 
        borderColor: '#ccc', 
        backgroundColor: '#fff',
        icon: '⏳'
      },
      [StepStatus.RUNNING]: { 
        borderColor: '#1890ff', 
        backgroundColor: '#e6f7ff',
        icon: '🔄',
        animation: 'pulse'
      },
      [StepStatus.WAITING_INPUT]: { 
        borderColor: '#faad14', 
        backgroundColor: '#fffbe6',
        icon: '⏸️'
      },
      [StepStatus.SUCCESS]: { 
        borderColor: '#52c41a', 
        backgroundColor: '#f6ffed',
        icon: '✅'
      },
      [StepStatus.FAILED]: { 
        borderColor: '#ff4d4f', 
        backgroundColor: '#fff2f0',
        icon: '❌'
      },
      [StepStatus.SKIPPED]: { 
        borderColor: '#d9d9d9', 
        backgroundColor: '#fafafa',
        icon: '⏭️',
        opacity: 0.6
      }
    };
    
    return styles[status];
  }
}

interface NodeStyle {
  borderColor: string;
  backgroundColor: string;
  icon: string;
  animation?: string;
  opacity?: number;
}
```

### 编排器与引擎的交互流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        编排器与引擎交互流程                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  【设计阶段】                                                             │
│                                                                          │
│  1. 初始化                                                               │
│     编排器 ──→ engine.getRegisteredTools()                               │
│     编排器 ──→ engine.getRegisteredUIComponents()                        │
│     编排器 ←── 工具和组件列表（用于节点面板）                              │
│                                                                          │
│  2. 编辑工作流                                                           │
│     用户拖拽节点、连接连线、配置属性                                       │
│     编排器内部维护 EditorState                                           │
│                                                                          │
│  3. 保存/导出                                                            │
│     编排器 ──→ transformer.toWorkflowDefinition(editorState)             │
│     编排器 ──→ engine.importDefinition(json)                             │
│     或保存到文件/数据库                                                   │
│                                                                          │
│  【运行阶段】                                                             │
│                                                                          │
│  4. 加载工作流                                                           │
│     编排器 ──→ engine.loadWorkflow(definition)                           │
│                                                                          │
│  5. 启动执行                                                             │
│     编排器 ──→ engine.start()                                            │
│                                                                          │
│  6. 状态同步                                                             │
│     engine ──→ STEP_BAR_UPDATE 事件                                      │
│     编排器 ←── 更新节点视觉状态                                           │
│                                                                          │
│  7. UI 交互                                                              │
│     engine ──→ UI_RENDER 事件                                            │
│     编排器 ←── 渲染 UI 组件                                               │
│     用户操作 ──→ 编排器 ──→ engine.respondToUI()                          │
│                                                                          │
│  8. 执行完成                                                             │
│     engine ──→ WORKFLOW_COMPLETE 事件                                    │
│     编排器 ←── 显示完成状态                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```


## UI 组件使用示例

### 示例场景：文件处理工作流

假设我们有一个文件处理工作流，需要：
1. 显示"正在处理中"的提示（展示型 UI）
2. 让用户确认是否继续（确认型 UI）
3. 让用户选择处理方式（选择型 UI）

### 1. 注册 UI 组件

```typescript
// 创建引擎实例
const engine = new WorkflowEngine();

// 注册展示型 UI 组件：Loading 提示
engine.registerUIComponent(
  {
    id: 'loading-toast',
    name: '加载提示',
    description: '显示加载中的提示信息',
    supportedModes: [UIMode.DISPLAY],
    propsSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '提示信息' },
        icon: { type: 'string', description: '图标' }
      }
    }
  },
  {
    // 渲染器：实际渲染逻辑由外部 UI 层实现
    render: async (config, context) => {
      // 这里只是发出渲染请求，实际渲染由监听 UI_RENDER 事件的 UI 层处理
      return { rendered: true };
    }
  }
);

// 注册确认型 UI 组件：确认对话框
engine.registerUIComponent(
  {
    id: 'confirm-dialog',
    name: '确认对话框',
    description: '显示确认对话框，等待用户确认',
    supportedModes: [UIMode.CONFIRM],
    propsSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        message: { type: 'string' },
        confirmText: { type: 'string' },
        cancelText: { type: 'string' }
      }
    }
  },
  {
    render: async (config, context) => {
      // 确认型 UI 需要等待用户响应
      // 返回值会在 respondToUI 被调用后填充
      return { rendered: true };
    }
  }
);

// 注册选择型 UI 组件：选项卡片
engine.registerUIComponent(
  {
    id: 'choice-cards',
    name: '选项卡片',
    description: '显示多个选项卡片，用户选择一个',
    supportedModes: [UIMode.SELECT],
    propsSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' }
      }
    }
  },
  {
    render: async (config, context) => {
      return { rendered: true };
    }
  }
);
```

### 2. 定义使用 UI 的工作流

```typescript
const fileProcessWorkflow: WorkflowDefinition = {
  id: 'file-process-workflow',
  name: '文件处理工作流',
  steps: [
    // 步骤 1：显示处理中提示（展示型 UI）
    {
      id: 'show-loading',
      name: '显示处理提示',
      type: 'ui',
      ui: {
        componentId: 'loading-toast',
        mode: UIMode.DISPLAY,
        data: {
          message: '正在分析文件，请稍候...',
          icon: '⏳'
        },
        timeout: 2000  // 2 秒后自动继续
      }
    },
    
    // 步骤 2：执行文件分析
    {
      id: 'analyze-file',
      name: '分析文件',
      type: 'task',
      dependencies: ['show-loading'],
      config: {
        // 任务配置...
      }
    },
    
    // 步骤 3：确认是否继续（确认型 UI）
    {
      id: 'confirm-continue',
      name: '确认继续',
      type: 'ui',
      dependencies: ['analyze-file'],
      ui: {
        componentId: 'confirm-dialog',
        mode: UIMode.CONFIRM,
        data: {
          title: '分析完成',
          message: '文件分析完成，发现 10 个待处理项。是否继续处理？',
          confirmText: '继续',
          cancelText: '取消'
        }
      }
    },
    
    // 步骤 4：选择处理方式（选择型 UI）
    {
      id: 'choose-method',
      name: '选择处理方式',
      type: 'ui',
      dependencies: ['confirm-continue'],
      // 如果用户在上一步取消，则跳过此步骤
      skipPolicy: {
        condition: (ctx) => ctx.getStepOutput('confirm-continue')?.userResponse === false,
        defaultOutput: { selectedOption: null }
      },
      ui: {
        componentId: 'choice-cards',
        mode: UIMode.SELECT,
        data: {
          title: '选择处理方式',
          description: '请选择您希望的处理方式'
        },
        options: [
          { id: 'quick', label: '快速处理', value: { speed: 'fast', quality: 'normal' } },
          { id: 'standard', label: '标准处理', value: { speed: 'normal', quality: 'high' } },
          { id: 'thorough', label: '深度处理', value: { speed: 'slow', quality: 'best' } }
        ]
      }
    },
    
    // 步骤 5：执行处理（根据选择）
    {
      id: 'process-file',
      name: '处理文件',
      type: 'task',
      dependencies: ['choose-method'],
      skipPolicy: {
        condition: (ctx) => ctx.getStepOutput('choose-method')?.selectedOption === null,
        defaultOutput: null
      }
    },
    
    // 步骤 6：显示完成提示
    {
      id: 'show-complete',
      name: '显示完成',
      type: 'ui',
      dependencies: ['process-file'],
      ui: {
        componentId: 'loading-toast',
        mode: UIMode.DISPLAY,
        data: {
          message: '处理完成！',
          icon: '✅'
        },
        timeout: 3000
      }
    }
  ]
};
```

### 3. UI 层监听和响应

```typescript
// UI 层代码（例如 React 组件）
class WorkflowUILayer {
  private engine: IWorkflowEngine;
  private currentUIStep: string | null = null;
  
  constructor(engine: IWorkflowEngine) {
    this.engine = engine;
    this.bindEvents();
  }
  
  private bindEvents() {
    // 监听 UI 渲染事件
    this.engine.on(EventType.UI_RENDER, (event) => {
      const { stepId, payload } = event;
      const uiConfig = payload as UIConfig;
      
      this.currentUIStep = stepId;
      this.renderUI(uiConfig);
    });
  }
  
  private renderUI(config: UIConfig) {
    switch (config.mode) {
      case UIMode.DISPLAY:
        // 展示型：显示 UI，等待 timeout 后自动继续
        this.showDisplayUI(config);
        break;
        
      case UIMode.CONFIRM:
        // 确认型：显示确认对话框，等待用户点击
        this.showConfirmUI(config);
        break;
        
      case UIMode.SELECT:
        // 选择型：显示选项，等待用户选择
        this.showSelectUI(config);
        break;
    }
  }
  
  // 展示型 UI：显示后自动继续（引擎内部处理 timeout）
  private showDisplayUI(config: UIConfig) {
    // 渲染 Toast 或 Loading 组件
    console.log(`显示提示: ${config.data?.message}`);
    // UI 会在 timeout 后自动消失，引擎会自动继续执行
  }
  
  // 确认型 UI：需要用户响应
  private showConfirmUI(config: UIConfig) {
    // 渲染确认对话框
    // 假设这是一个 React 组件的渲染
    const handleConfirm = () => {
      this.engine.respondToUI(this.currentUIStep!, {
        rendered: true,
        userResponse: true  // 用户点击了确认
      });
    };
    
    const handleCancel = () => {
      this.engine.respondToUI(this.currentUIStep!, {
        rendered: true,
        userResponse: false  // 用户点击了取消
      });
    };
    
    // 渲染对话框，绑定按钮事件
    console.log(`显示确认对话框: ${config.data?.message}`);
    // <ConfirmDialog onConfirm={handleConfirm} onCancel={handleCancel} />
  }
  
  // 选择型 UI：需要用户选择一个选项
  private showSelectUI(config: UIConfig) {
    // 渲染选项卡片
    const handleSelect = (optionId: string) => {
      const selectedOption = config.options?.find(o => o.id === optionId);
      
      this.engine.respondToUI(this.currentUIStep!, {
        rendered: true,
        selectedOption: optionId,
        userResponse: selectedOption?.value
      });
    };
    
    console.log(`显示选项: ${config.options?.map(o => o.label).join(', ')}`);
    // <ChoiceCards options={config.options} onSelect={handleSelect} />
  }
}
```

### 4. 执行流程详解

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        UI 交互执行流程                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  【展示型 UI (DISPLAY)】                                                 │
│                                                                          │
│  Engine                          UI Layer                                │
│    │                                │                                    │
│    │──── UI_RENDER 事件 ──────────→│                                    │
│    │     { mode: DISPLAY,           │                                    │
│    │       timeout: 2000 }          │                                    │
│    │                                │                                    │
│    │     (引擎内部启动计时器)        │──→ 渲染 Loading Toast              │
│    │                                │                                    │
│    │     ... 2 秒后 ...             │                                    │
│    │                                │                                    │
│    │     (计时器触发，自动继续)      │                                    │
│    │──── 继续执行下一步 ──→         │                                    │
│                                                                          │
│  【确认型 UI (CONFIRM)】                                                 │
│                                                                          │
│  Engine                          UI Layer                                │
│    │                                │                                    │
│    │──── UI_RENDER 事件 ──────────→│                                    │
│    │     { mode: CONFIRM }          │                                    │
│    │                                │                                    │
│    │     (引擎进入等待状态)          │──→ 渲染确认对话框                  │
│    │                                │                                    │
│    │                                │    用户点击"确认"                  │
│    │                                │         │                          │
│    │←── respondToUI() ─────────────│←────────┘                          │
│    │    { userResponse: true }      │                                    │
│    │                                │                                    │
│    │     (引擎恢复执行)              │                                    │
│    │──── 继续执行下一步 ──→         │                                    │
│                                                                          │
│  【选择型 UI (SELECT)】                                                  │
│                                                                          │
│  Engine                          UI Layer                                │
│    │                                │                                    │
│    │──── UI_RENDER 事件 ──────────→│                                    │
│    │     { mode: SELECT,            │                                    │
│    │       options: [...] }         │                                    │
│    │                                │                                    │
│    │     (引擎进入等待状态)          │──→ 渲染选项卡片                    │
│    │                                │                                    │
│    │                                │    用户选择"快速处理"              │
│    │                                │         │                          │
│    │←── respondToUI() ─────────────│←────────┘                          │
│    │    { selectedOption: 'quick',  │                                    │
│    │      userResponse: {...} }     │                                    │
│    │                                │                                    │
│    │     (引擎恢复执行)              │                                    │
│    │     (选择结果存入上下文)        │                                    │
│    │──── 继续执行下一步 ──→         │                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5. 步骤条状态变化

```
执行过程中步骤条状态变化：

时刻 T1: 开始执行
┌────────┬────────┬────────┬────────┬────────┬────────┐
│ Loading│ Analyze│ Confirm│ Choose │ Process│Complete│
│   🔄   │   ⏳   │   ⏳   │   ⏳   │   ⏳   │   ⏳   │
│ running│ pending│ pending│ pending│ pending│ pending│
└────────┴────────┴────────┴────────┴────────┴────────┘

时刻 T2: Loading 完成，Analyze 执行中
┌────────┬────────┬────────┬────────┬────────┬────────┐
│ Loading│ Analyze│ Confirm│ Choose │ Process│Complete│
│   ✅   │   🔄   │   ⏳   │   ⏳   │   ⏳   │   ⏳   │
│ success│ running│ pending│ pending│ pending│ pending│
└────────┴────────┴────────┴────────┴────────┴────────┘

时刻 T3: Confirm 等待用户输入
┌────────┬────────┬────────┬────────┬────────┬────────┐
│ Loading│ Analyze│ Confirm│ Choose │ Process│Complete│
│   ✅   │   ✅   │   ⏸️   │   ⏳   │   ⏳   │   ⏳   │
│ success│ success│ waiting│ pending│ pending│ pending│
└────────┴────────┴────────┴────────┴────────┴────────┘

时刻 T4: 用户确认，Choose 等待选择
┌────────┬────────┬────────┬────────┬────────┬────────┐
│ Loading│ Analyze│ Confirm│ Choose │ Process│Complete│
│   ✅   │   ✅   │   ✅   │   ⏸️   │   ⏳   │   ⏳   │
│ success│ success│ success│ waiting│ pending│ pending│
└────────┴────────┴────────┴────────┴────────┴────────┘

时刻 T5: 用户选择完成，Process 执行中
┌────────┬────────┬────────┬────────┬────────┬────────┐
│ Loading│ Analyze│ Confirm│ Choose │ Process│Complete│
│   ✅   │   ✅   │   ✅   │   ✅   │   🔄   │   ⏳   │
│ success│ success│ success│ success│ running│ pending│
└────────┴────────┴────────┴────────┴────────┴────────┘

时刻 T6: 全部完成
┌────────┬────────┬────────┬────────┬────────┬────────┐
│ Loading│ Analyze│ Confirm│ Choose │ Process│Complete│
│   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │   ✅   │
│ success│ success│ success│ success│ success│ success│
└────────┴────────┴────────┴────────┴────────┴────────┘
```

### 6. 上下文数据流

```typescript
// 执行过程中上下文数据变化

// T1: show-loading 完成后
context.getStepOutput('show-loading')
// → { rendered: true }

// T2: analyze-file 完成后
context.getStepOutput('analyze-file')
// → { itemCount: 10, fileSize: 1024, ... }

// T3: confirm-continue 用户确认后
context.getStepOutput('confirm-continue')
// → { rendered: true, userResponse: true }

// T4: choose-method 用户选择后
context.getStepOutput('choose-method')
// → { rendered: true, selectedOption: 'quick', userResponse: { speed: 'fast', quality: 'normal' } }

// T5: process-file 可以访问之前的选择
const choice = context.getStepOutput('choose-method');
const processConfig = choice.userResponse;
// processConfig = { speed: 'fast', quality: 'normal' }
```


### 7. UI 层与引擎的解耦设计

**核心原则：WorkflowEngine 与 UILayer 完全解耦，通过事件通信。**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     UI 层与引擎解耦架构                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    WorkflowEngine (核心引擎)                     │    │
│  │                                                                  │    │
│  │  职责：                                                          │    │
│  │  - 解析工作流定义                                                │    │
│  │  - 调度步骤执行                                                  │    │
│  │  - 管理上下文和状态                                              │    │
│  │  - 发出事件通知                                                  │    │
│  │                                                                  │    │
│  │  不负责：                                                        │    │
│  │  - 实际渲染 UI                                                   │    │
│  │  - 处理用户交互                                                  │    │
│  │  - 管理 DOM/视图                                                 │    │
│  │                                                                  │    │
│  │  ┌──────────────┐                                               │    │
│  │  │  UIRegistry  │  存储 UI 组件元数据（id, name, schema 等）     │    │
│  │  │              │  不存储实际渲染逻辑                            │    │
│  │  └──────────────┘                                               │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              │ 事件通信                                  │
│                              │                                           │
│                    ┌─────────▼─────────┐                                │
│                    │   UI_RENDER 事件   │                                │
│                    │   UI_RESPONSE 事件 │                                │
│                    └─────────┬─────────┘                                │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    UILayer (UI 层 - 可替换)                      │    │
│  │                                                                  │    │
│  │  职责：                                                          │    │
│  │  - 监听 UI_RENDER 事件                                           │    │
│  │  - 根据 componentId 渲染对应 UI 组件                             │    │
│  │  - 处理用户交互                                                  │    │
│  │  - 调用 respondToUI() 响应引擎                                   │    │
│  │                                                                  │    │
│  │  可以是：                                                        │    │
│  │  - React 应用                                                    │    │
│  │  - Vue 应用                                                      │    │
│  │  - 原生 DOM                                                      │    │
│  │  - 终端 UI                                                       │    │
│  │  - 测试 Mock                                                     │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**详细交互流程：**

```typescript
// ==================== 引擎侧 ====================

class WorkflowEngine {
  private uiRegistry: UIRegistry;
  private eventEmitter: EventEmitter;
  
  /**
   * 执行 UI 步骤
   * 引擎只负责：
   * 1. 验证 componentId 是否已注册
   * 2. 发出 UI_RENDER 事件
   * 3. 等待响应或超时
   */
  private async executeUIStep(step: StepDefinition, context: Context): Promise<StepResult> {
    const uiConfig = step.ui!;
    
    // 1. 验证组件是否注册（只检查元数据，不涉及渲染）
    const componentMeta = this.uiRegistry.get(uiConfig.componentId);
    if (!componentMeta) {
      throw new UIComponentNotFoundError(uiConfig.componentId);
    }
    
    // 2. 验证模式是否支持
    if (!componentMeta.supportedModes.includes(uiConfig.mode)) {
      throw new WorkflowError(
        `组件 ${uiConfig.componentId} 不支持 ${uiConfig.mode} 模式`,
        'UI_MODE_NOT_SUPPORTED'
      );
    }
    
    // 3. 发出 UI_RENDER 事件（通知 UI 层渲染）
    this.eventEmitter.emit({
      type: EventType.UI_RENDER,
      timestamp: Date.now(),
      workflowId: this.workflowId,
      instanceId: this.instanceId,
      stepId: step.id,
      payload: {
        componentId: uiConfig.componentId,
        componentMeta: componentMeta,  // 传递元数据供 UI 层参考
        mode: uiConfig.mode,
        data: uiConfig.data,
        options: uiConfig.options,
        timeout: uiConfig.timeout
      }
    });
    
    // 4. 根据模式处理
    if (uiConfig.mode === UIMode.DISPLAY) {
      // 展示型：启动计时器，超时后自动继续
      await this.waitForTimeout(uiConfig.timeout || 0);
      return { stepId: step.id, status: StepStatus.SUCCESS, output: { rendered: true } };
    } else {
      // 确认型/选择型：等待 UI 层响应
      return this.waitForUIResponse(step.id);
    }
  }
  
  /**
   * 接收 UI 层的响应
   * UI 层调用此方法来通知引擎用户操作完成
   */
  respondToUI(stepId: string, response: UIRenderResult): void {
    // 验证步骤确实在等待 UI 响应
    const stepState = this.stepStates.get(stepId);
    if (!stepState || stepState.status !== StepStatus.WAITING_INPUT) {
      throw new WorkflowError(`步骤 ${stepId} 未在等待 UI 响应`, 'INVALID_UI_RESPONSE');
    }
    
    // 存储响应到上下文
    this.context.setStepOutput(stepId, response);
    
    // 恢复步骤执行
    this.resumeStep(stepId, response);
    
    // 发出响应事件
    this.eventEmitter.emit({
      type: EventType.UI_RESPONSE,
      timestamp: Date.now(),
      workflowId: this.workflowId,
      instanceId: this.instanceId,
      stepId: stepId,
      payload: response
    });
  }
}

// ==================== UI 层侧（示例：React 实现）====================

class ReactUILayer {
  private engine: IWorkflowEngine;
  
  // UI 组件映射表（UI 层自己维护实际的渲染组件）
  private componentMap: Map<string, React.ComponentType<any>> = new Map([
    ['loading-toast', LoadingToast],
    ['confirm-dialog', ConfirmDialog],
    ['choice-cards', ChoiceCards],
  ]);
  
  constructor(engine: IWorkflowEngine) {
    this.engine = engine;
    
    // 监听 UI_RENDER 事件
    this.engine.on(EventType.UI_RENDER, this.handleUIRender.bind(this));
  }
  
  private handleUIRender(event: WorkflowEvent) {
    const { stepId, payload } = event;
    const { componentId, mode, data, options } = payload;
    
    // 根据 componentId 查找 UI 层自己的组件
    const Component = this.componentMap.get(componentId);
    
    if (!Component) {
      console.error(`UI 层未找到组件: ${componentId}`);
      // 可以选择：渲染默认组件、显示错误、或通知引擎
      return;
    }
    
    // 渲染组件
    this.renderComponent(Component, {
      stepId,
      mode,
      data,
      options,
      onResponse: (response: UIRenderResult) => {
        // 用户操作完成，通知引擎
        this.engine.respondToUI(stepId, response);
      }
    });
  }
}
```

**关键设计点：**

| 方面 | 引擎职责 | UI 层职责 |
|------|---------|----------|
| 组件注册 | 存储元数据（id, name, schema） | 存储实际渲染组件 |
| 渲染触发 | 发出 UI_RENDER 事件 | 监听事件并渲染 |
| 组件查找 | 验证 componentId 是否注册 | 根据 componentId 查找渲染组件 |
| 用户交互 | 等待响应 | 处理交互，调用 respondToUI |
| 状态管理 | 管理步骤状态、上下文 | 管理 UI 状态 |

**为什么这样设计？**

1. **引擎可独立测试**：不依赖任何 UI 框架，可以用 Mock 响应测试
2. **UI 层可替换**：同一个引擎可以对接 React、Vue、终端等不同 UI
3. **关注点分离**：引擎专注业务逻辑，UI 层专注渲染和交互
4. **灵活部署**：引擎可以运行在 Node.js 后端，UI 层在浏览器前端

**测试示例（无需真实 UI）：**

```typescript
// 测试时可以用 Mock UI 层
const engine = new WorkflowEngine();

// 监听 UI_RENDER 事件，自动响应
engine.on(EventType.UI_RENDER, (event) => {
  const { stepId, payload } = event;
  
  // 模拟用户操作
  setTimeout(() => {
    if (payload.mode === UIMode.CONFIRM) {
      engine.respondToUI(stepId, { rendered: true, userResponse: true });
    } else if (payload.mode === UIMode.SELECT) {
      engine.respondToUI(stepId, { 
        rendered: true, 
        selectedOption: payload.options[0].id,
        userResponse: payload.options[0].value 
      });
    }
  }, 100);
});

// 执行工作流
const result = await engine.start();
```
