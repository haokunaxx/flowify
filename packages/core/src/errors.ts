/**
 * 工作流引擎错误类型层次
 */

/**
 * 基础工作流错误
 */
export class WorkflowError extends Error {
  constructor(
    message: string,
    public code: string,
    public workflowId?: string,
    public stepId?: string
  ) {
    super(message);
    this.name = 'WorkflowError';
    // 确保原型链正确
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 验证错误：工作流定义无效
 */
export class ValidationError extends WorkflowError {
  constructor(message: string, public details: string[]) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * 循环依赖错误
 */
export class CyclicDependencyError extends ValidationError {
  constructor(public cycle: string[]) {
    super(`检测到循环依赖: ${cycle.join(' -> ')}`, [cycle.join(' -> ')]);
    this.name = 'CyclicDependencyError';
  }
}

/**
 * 步骤执行错误
 */
export class StepExecutionError extends WorkflowError {
  constructor(
    message: string,
    stepId: string,
    public originalError?: Error
  ) {
    super(message, 'STEP_EXECUTION_ERROR', undefined, stepId);
    this.name = 'StepExecutionError';
  }
}

/**
 * 工具未找到错误
 */
export class ToolNotFoundError extends WorkflowError {
  constructor(public toolId: string) {
    super(`工具未注册: ${toolId}`, 'TOOL_NOT_FOUND');
    this.name = 'ToolNotFoundError';
  }
}

/**
 * UI 组件未找到错误
 */
export class UIComponentNotFoundError extends WorkflowError {
  constructor(public componentId: string) {
    super(`UI 组件未注册: ${componentId}`, 'UI_COMPONENT_NOT_FOUND');
    this.name = 'UIComponentNotFoundError';
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends WorkflowError {
  constructor(message: string, stepId: string, public timeoutMs: number) {
    super(message, 'TIMEOUT_ERROR', undefined, stepId);
    this.name = 'TimeoutError';
  }
}

/**
 * Hook 执行错误
 */
export class HookExecutionError extends WorkflowError {
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

/**
 * Schema 验证错误
 */
export class SchemaValidationError extends WorkflowError {
  constructor(
    message: string,
    public schemaErrors: string[]
  ) {
    super(message, 'SCHEMA_VALIDATION_ERROR');
    this.name = 'SchemaValidationError';
  }
}

/**
 * 工具执行错误
 */
export class ToolExecutionError extends WorkflowError {
  constructor(
    public toolId: string,
    message: string,
    stepId?: string,
    public originalError?: Error
  ) {
    super(message, 'TOOL_EXECUTION_ERROR', undefined, stepId);
    this.name = 'ToolExecutionError';
  }
}
