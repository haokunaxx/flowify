// 工作流引擎主入口

// 核心类型和错误
export * from './core';

// 调度器
export { Scheduler, DAGBuilder, type DAG, type DAGNode, type ValidationResult } from './scheduler';

// 执行器
export {
  Executor,
  RetryStrategy,
  SkipStrategy,
  createDefaultRetryPolicy,
  collectDependencyOutputs,
  createDependencyInput,
  type StepResult,
  type DependencyInput,
  type StepExecuteFn,
} from './executor';

// 上下文（使用别名避免与接口冲突）
export { Context as ContextImpl } from './context';

// 事件系统
export {
  EventEmitter,
  EventType,
  createWorkflowEvent,
  type WorkflowEvent,
  type EventListener,
  type ProgressPayload,
  type StepBarPayload,
  type StepBarItem,
} from './events';

// 注册表
export { ToolRegistry, UIRegistry } from './registry';

// Hook 管理
export { HookManager, HookContext as HookContextImpl, type HookExecutionResult } from './hooks';

// 工具调用
export {
  ToolInvoker,
  validateSchema,
  executeToolInvocations,
  type ToolCallResult,
  type PendingToolCall,
  type SchemaValidationResult,
} from './tools';

// 异步等待
export {
  WaitManager,
  TimeoutStrategy,
  createWaitingInfo,
  createTimeoutConfig,
  type TimeoutConfig,
  type WaitItem,
  type WaitResumeCallback,
  type WaitCancelCallback,
  type WaitTimeoutCallback,
} from './async';

// 进度管理
export { ProgressManager, type StepProgressState } from './progress';

// UI 交互
export { UIInteractionHandler, type UIInteractionResult, type PendingUIInteraction } from './ui';

// 工作流引擎主类
export { WorkflowEngine, type WorkflowInstance, type WorkflowResult } from './engine';
