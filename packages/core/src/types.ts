/**
 * 工作流引擎核心类型定义
 */

// ============ 枚举定义 ============

/**
 * 步骤状态枚举
 */
export enum StepStatus {
  /** 待执行 */
  PENDING = 'pending',
  /** 执行中 */
  RUNNING = 'running',
  /** 等待输入 */
  WAITING_INPUT = 'waiting_input',
  /** 成功 */
  SUCCESS = 'success',
  /** 失败 */
  FAILED = 'failed',
  /** 跳过 */
  SKIPPED = 'skipped',
}

/**
 * 工作流状态枚举
 */
export enum WorkflowStatus {
  /** 空闲 */
  IDLE = 'idle',
  /** 运行中 */
  RUNNING = 'running',
  /** 暂停 */
  PAUSED = 'paused',
  /** 完成 */
  COMPLETED = 'completed',
  /** 失败 */
  FAILED = 'failed',
}

/**
 * UI 交互模式
 */
export enum UIMode {
  /** 展示型：自动继续 */
  DISPLAY = 'display',
  /** 确认型：等待确认 */
  CONFIRM = 'confirm',
  /** 选择型：根据选择决定路径 */
  SELECT = 'select',
}

/**
 * 工具执行模式
 */
export enum ToolMode {
  /** 同步执行 */
  SYNC = 'sync',
  /** 异步执行 */
  ASYNC = 'async',
}

// ============ 接口定义 ============

/**
 * 重试策略
 */
export interface RetryPolicy {
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试间隔（毫秒） */
  retryInterval: number;
  /** 是否启用指数退避 */
  exponentialBackoff?: boolean;
  /** 退避倍数，默认 2 */
  backoffMultiplier?: number;
}

/**
 * 上下文接口（前向声明，用于 SkipConditionFn）
 */
export interface Context {
  workflowId: string;
  instanceId: string;
  getStepOutput: (stepId: string) => unknown;
  getDependencyOutputs: (stepIds: string[]) => Record<string, unknown>;
  hasStepOutput: (stepId: string) => boolean;
  setStepOutput: (stepId: string, output: unknown) => void;
  getGlobal: (key: string) => unknown;
  setGlobal: (key: string, value: unknown) => void;
  snapshot: () => ContextSnapshot;
  getStepIds: () => string[];
  getGlobalKeys: () => string[];
  clearStepOutputs: () => void;
  clearGlobals: () => void;
  clear: () => void;
  restore: (snapshot: ContextSnapshot) => void;
}

/**
 * 上下文快照
 */
export interface ContextSnapshot {
  stepOutputs: Record<string, unknown>;
  globals: Record<string, unknown>;
}

/**
 * 跳过条件函数类型
 */
export type SkipConditionFn = (context: Context) => boolean;

/**
 * 跳过策略
 */
export interface SkipPolicy {
  /** 跳过条件表达式或函数 */
  condition: string | SkipConditionFn;
  /** 跳过时的默认输出 */
  defaultOutput?: unknown;
}

/**
 * 选择型 UI 选项
 */
export interface UISelectOption {
  id: string;
  label: string;
  /** 选择后跳转的步骤 */
  nextStepId?: string;
  /** 选项值 */
  value?: unknown;
}

/**
 * UI 配置
 */
export interface UIConfig {
  /** UI 组件标识 */
  componentId: string;
  /** 交互模式 */
  mode: UIMode;
  /** 渲染数据 */
  data?: Record<string, unknown>;
  /** 展示型 UI 的自动继续时间（毫秒） */
  timeout?: number;
  /** 选择型 UI 的选项 */
  options?: UISelectOption[];
}

/**
 * 工具调用配置
 */
export interface ToolInvocation {
  toolId: string;
  params?: Record<string, unknown>;
  /** 输出存储到上下文的 key */
  outputKey?: string;
}

/**
 * Hook 函数签名
 */
export type HookFn = (hookContext: HookContext) => Promise<void>;

/**
 * Hook 上下文
 */
export interface HookContext {
  stepId: string;
  stepInput: unknown;
  /** 仅 afterHook 可用 */
  stepOutput?: unknown;
  context: Context;
  /** 修改步骤输入 */
  modifyInput: (newInput: unknown) => void;
}

/**
 * Hook 处理器
 */
export interface HookHandler {
  id: string;
  name: string;
  handler: HookFn;
}

/**
 * Hook 定义
 */
export interface HookDefinition {
  beforeHooks?: HookHandler[];
  afterHooks?: HookHandler[];
}

/**
 * 步骤定义
 */
export interface StepDefinition {
  /** 步骤唯一标识 */
  id: string;
  /** 步骤名称 */
  name: string;
  /** 步骤类型标识 */
  type: string;
  /** 依赖的步骤 ID 列表 */
  dependencies?: string[];
  /** 步骤配置 */
  config?: Record<string, unknown>;
  /** 重试策略 */
  retryPolicy?: RetryPolicy;
  /** 跳过策略 */
  skipPolicy?: SkipPolicy;
  /** Hook 配置 */
  hooks?: HookDefinition;
  /** UI 配置 */
  ui?: UIConfig;
  /** 工具调用配置 */
  tools?: ToolInvocation[];
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  /** 工作流唯一标识 */
  id: string;
  /** 工作流名称 */
  name: string;
  /** 工作流描述 */
  description?: string;
  /** 步骤列表 */
  steps: StepDefinition[];
  /** 全局 Hook 配置 */
  globalHooks?: HookDefinition;
}

// ============ JSON Schema 类型 ============

/**
 * 简化的 JSON Schema 定义
 */
export interface JSONSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
}

// ============ 工具相关类型 ============

/**
 * 工具注册信息（元数据）
 */
export interface ToolMeta {
  /** 工具唯一标识 */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description?: string;
  /** 执行模式 */
  mode: ToolMode;
  /** 输入参数 Schema */
  inputSchema?: JSONSchema;
  /** 输出结果 Schema */
  outputSchema?: JSONSchema;
  /** 执行超时（毫秒） */
  timeout?: number;
}

/**
 * 工具执行器
 */
export interface ToolExecutor {
  execute: (params: unknown, context: Context) => Promise<unknown>;
}

/**
 * 工具注册项
 */
export interface ToolRegistration {
  meta: ToolMeta;
  executor: ToolExecutor;
}

// ============ UI 组件相关类型 ============

/**
 * UI 组件注册信息（元数据）
 */
export interface UIComponentMeta {
  /** 组件唯一标识 */
  id: string;
  /** 组件名称 */
  name: string;
  /** 组件描述 */
  description?: string;
  /** 支持的交互模式 */
  supportedModes: UIMode[];
  /** 组件属性 Schema */
  propsSchema?: JSONSchema;
}

/**
 * UI 渲染结果
 */
export interface UIRenderResult {
  rendered: boolean;
  userResponse?: unknown;
  selectedOption?: string;
}

/**
 * UI 组件渲染器
 */
export interface UIRenderer {
  render: (config: UIConfig, context: Context) => Promise<UIRenderResult>;
}

/**
 * UI 组件注册项
 */
export interface UIComponentRegistration {
  meta: UIComponentMeta;
  renderer: UIRenderer;
}

// ============ 等待机制相关类型 ============

/**
 * 等待类型
 */
export enum WaitType {
  /** UI 交互等待 */
  UI = 'ui',
  /** 工具调用等待 */
  TOOL = 'tool',
  /** 外部信号等待 */
  SIGNAL = 'signal',
}

/**
 * 等待信息
 * 存储步骤等待状态的详细信息
 */
export interface WaitingInfo {
  /** 等待类型 */
  type: WaitType;
  /** 等待目标 ID（UI 组件 ID 或工具 ID 或信号名称） */
  targetId: string;
  /** 等待开始时间 */
  startTime: number;
  /** 超时时间（毫秒），undefined 表示无超时 */
  timeout?: number;
  /** 额外数据 */
  data?: unknown;
}

/**
 * 步骤运行时状态
 */
export interface StepState {
  /** 步骤 ID */
  stepId: string;
  /** 步骤状态 */
  status: StepStatus;
  /** 重试次数 */
  retryCount: number;
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 错误信息 */
  error?: Error;
  /** 等待信息（当状态为 WAITING_INPUT 时） */
  waitingFor?: WaitingInfo;
}
