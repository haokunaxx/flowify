/**
 * 工具调用系统模块
 * 实现同步和异步工具调用，包括 Schema 验证和超时控制
 */

import type {
  ToolMeta,
  ToolRegistration,
  Context,
  JSONSchema,
  ToolInvocation,
} from '@flowify/core';
import {
  ToolMode,
  ToolNotFoundError,
  SchemaValidationError,
  TimeoutError,
  ToolExecutionError,
} from '@flowify/core';
import { ToolRegistry } from '../registry';
import { EventEmitter, EventType, createWorkflowEvent } from '../events';

// ============ Schema 验证器 ============

/**
 * Schema 验证结果
 */
export interface SchemaValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 验证错误列表 */
  errors: string[];
}

/**
 * 验证输入参数是否符合 JSON Schema
 * 实现简化的 JSON Schema 验证逻辑
 * 
 * @param value 待验证的值
 * @param schema JSON Schema 定义
 * @param path 当前路径（用于错误信息）
 * @returns 验证结果
 */
export function validateSchema(
  value: unknown,
  schema: JSONSchema,
  path: string = ''
): SchemaValidationResult {
  const errors: string[] = [];
  const currentPath = path || 'root';

  // 检查类型
  const actualType = getValueType(value);
  if (actualType !== schema.type) {
    errors.push(`${currentPath}: 期望类型 ${schema.type}，实际类型 ${actualType}`);
    return { valid: false, errors };
  }

  // 对象类型的额外验证
  if (schema.type === 'object' && typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    // 检查必需字段
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!(requiredField in obj)) {
          errors.push(`${currentPath}: 缺少必需字段 "${requiredField}"`);
        }
      }
    }

    // 递归验证属性
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in obj) {
          const propResult = validateSchema(
            obj[propName],
            propSchema,
            `${currentPath}.${propName}`
          );
          errors.push(...propResult.errors);
        }
      }
    }
  }

  // 数组类型的额外验证
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const itemResult = validateSchema(
          value[i],
          schema.items,
          `${currentPath}[${i}]`
        );
        errors.push(...itemResult.errors);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 获取值的类型字符串
 * @param value 值
 * @returns 类型字符串
 */
function getValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

// ============ 工具调用器 ============

/**
 * 工具调用结果
 */
export interface ToolCallResult {
  /** 是否成功 */
  success: boolean;
  /** 工具 ID */
  toolId: string;
  /** 执行结果 */
  result?: unknown;
  /** 错误信息 */
  error?: Error;
  /** 执行耗时（毫秒） */
  duration?: number;
}

/**
 * 等待中的异步工具调用信息
 */
export interface PendingToolCall {
  /** 工具 ID */
  toolId: string;
  /** 步骤 ID */
  stepId: string;
  /** 调用参数 */
  params: unknown;
  /** 开始时间 */
  startTime: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 完成回调 */
  resolve: (result: unknown) => void;
  /** 错误回调 */
  reject: (error: Error) => void;
}

/**
 * 工具调用器
 * 负责执行同步和异步工具调用
 */
export class ToolInvoker {
  /** 工具注册表 */
  private registry: ToolRegistry;
  
  /** 事件发射器 */
  private eventEmitter: EventEmitter;
  
  /** 工作流 ID */
  private workflowId: string;
  
  /** 实例 ID */
  private instanceId: string;
  
  /** 等待中的异步工具调用 */
  private pendingCalls: Map<string, PendingToolCall> = new Map();

  /**
   * 创建工具调用器
   * @param registry 工具注册表
   * @param eventEmitter 事件发射器
   * @param workflowId 工作流 ID
   * @param instanceId 实例 ID
   */
  constructor(
    registry: ToolRegistry,
    eventEmitter: EventEmitter,
    workflowId: string,
    instanceId: string
  ) {
    this.registry = registry;
    this.eventEmitter = eventEmitter;
    this.workflowId = workflowId;
    this.instanceId = instanceId;
  }

  /**
   * 调用工具
   * 根据工具模式自动选择同步或异步调用
   * 
   * @param toolId 工具 ID
   * @param params 调用参数
   * @param context 工作流上下文
   * @param stepId 步骤 ID（可选）
   * @returns 工具调用结果
   */
  async invoke(
    toolId: string,
    params: unknown,
    context: Context,
    stepId?: string
  ): Promise<ToolCallResult> {
    const startTime = Date.now();

    // 1. 查找工具
    let registration: ToolRegistration;
    try {
      registration = this.registry.get(toolId);
    } catch (error) {
      if (error instanceof ToolNotFoundError) {
        return {
          success: false,
          toolId,
          error,
        };
      }
      throw error;
    }

    const { meta, executor } = registration;

    // 2. 验证输入参数 Schema
    if (meta.inputSchema) {
      const validationResult = validateSchema(params, meta.inputSchema);
      if (!validationResult.valid) {
        const schemaError = new SchemaValidationError(
          `工具 ${toolId} 输入参数验证失败`,
          validationResult.errors
        );
        this.emitToolEvent(EventType.TOOL_FAILED, toolId, stepId, {
          params,
          error: schemaError.message,
          validationErrors: validationResult.errors,
        });
        return {
          success: false,
          toolId,
          error: schemaError,
        };
      }
    }

    // 3. 发出工具调用事件
    this.emitToolEvent(EventType.TOOL_INVOKE, toolId, stepId, {
      params,
      mode: meta.mode,
    });

    // 4. 根据模式执行工具
    if (meta.mode === ToolMode.SYNC) {
      return this.executeSyncTool(toolId, params, context, meta, executor, stepId, startTime);
    } else {
      return this.executeAsyncTool(toolId, params, context, meta, stepId, startTime);
    }
  }

  /**
   * 执行同步工具
   * 直接调用工具执行器，支持超时控制
   */
  private async executeSyncTool(
    toolId: string,
    params: unknown,
    context: Context,
    meta: ToolMeta,
    executor: { execute: (params: unknown, context: Context) => Promise<unknown> },
    stepId?: string,
    startTime: number = Date.now()
  ): Promise<ToolCallResult> {
    try {
      let result: unknown;

      // 如果配置了超时，使用 Promise.race 实现超时控制
      if (meta.timeout && meta.timeout > 0) {
        result = await this.executeWithTimeout(
          () => executor.execute(params, context),
          meta.timeout,
          toolId,
          stepId
        );
      } else {
        result = await executor.execute(params, context);
      }

      const duration = Date.now() - startTime;

      // 发出工具完成事件
      this.emitToolEvent(EventType.TOOL_COMPLETE, toolId, stepId, {
        params,
        result,
        duration,
      });

      return {
        success: true,
        toolId,
        result,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 保留 TimeoutError 类型，不转换为 ToolExecutionError
      let toolError: Error;
      if (error instanceof TimeoutError) {
        toolError = error;
      } else if (error instanceof Error) {
        toolError = new ToolExecutionError(toolId, error.message, stepId, error);
      } else {
        toolError = new ToolExecutionError(toolId, String(error), stepId);
      }

      // 发出工具失败事件
      this.emitToolEvent(EventType.TOOL_FAILED, toolId, stepId, {
        params,
        error: toolError.message,
        duration,
      });

      return {
        success: false,
        toolId,
        error: toolError,
        duration,
      };
    }
  }

  /**
   * 执行异步工具
   * 发出工具调用事件并等待外部响应
   */
  private async executeAsyncTool(
    toolId: string,
    _params: unknown,
    _context: Context,
    meta: ToolMeta,
    stepId?: string,
    startTime: number = Date.now()
  ): Promise<ToolCallResult> {
    // 生成唯一调用 ID
    const callId = this.generateCallId(toolId, stepId);

    return new Promise<ToolCallResult>((resolve) => {
      // 创建等待中的调用记录
      const pendingCall: PendingToolCall = {
        toolId,
        stepId: stepId || '',
        params: _params,
        startTime,
        timeout: meta.timeout,
        resolve: (result: unknown) => {
          const duration = Date.now() - startTime;
          this.pendingCalls.delete(callId);

          // 发出工具完成事件
          this.emitToolEvent(EventType.TOOL_COMPLETE, toolId, stepId, {
            params: _params,
            result,
            duration,
          });

          resolve({
            success: true,
            toolId,
            result,
            duration,
          });
        },
        reject: (error: Error) => {
          const duration = Date.now() - startTime;
          this.pendingCalls.delete(callId);

          // 发出工具失败事件
          this.emitToolEvent(EventType.TOOL_FAILED, toolId, stepId, {
            params: _params,
            error: error.message,
            duration,
          });

          resolve({
            success: false,
            toolId,
            error,
            duration,
          });
        },
      };

      this.pendingCalls.set(callId, pendingCall);

      // 如果配置了超时，设置超时定时器
      if (meta.timeout && meta.timeout > 0) {
        setTimeout(() => {
          if (this.pendingCalls.has(callId)) {
            const timeoutError = new TimeoutError(
              `工具 ${toolId} 执行超时`,
              stepId || '',
              meta.timeout!
            );
            pendingCall.reject(timeoutError);
          }
        }, meta.timeout);
      }
    });
  }

  /**
   * 响应异步工具调用
   * 外部系统调用此方法提供工具执行结果
   * 
   * @param stepId 步骤 ID
   * @param toolId 工具 ID
   * @param result 执行结果
   * @returns 是否成功响应
   */
  respondToTool(stepId: string, toolId: string, result: unknown): boolean {
    const callId = this.generateCallId(toolId, stepId);
    const pendingCall = this.pendingCalls.get(callId);

    if (!pendingCall) {
      return false;
    }

    pendingCall.resolve(result);
    return true;
  }

  /**
   * 响应异步工具调用错误
   * 外部系统调用此方法报告工具执行错误
   * 
   * @param stepId 步骤 ID
   * @param toolId 工具 ID
   * @param error 错误信息
   * @returns 是否成功响应
   */
  respondToToolError(stepId: string, toolId: string, error: Error): boolean {
    const callId = this.generateCallId(toolId, stepId);
    const pendingCall = this.pendingCalls.get(callId);

    if (!pendingCall) {
      return false;
    }

    pendingCall.reject(error);
    return true;
  }

  /**
   * 检查是否有等待中的工具调用
   * @param stepId 步骤 ID（可选，不提供则检查所有）
   * @returns 是否有等待中的调用
   */
  hasPendingCalls(stepId?: string): boolean {
    if (!stepId) {
      return this.pendingCalls.size > 0;
    }
    for (const call of this.pendingCalls.values()) {
      if (call.stepId === stepId) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取等待中的工具调用数量
   */
  getPendingCallCount(): number {
    return this.pendingCalls.size;
  }

  /**
   * 取消等待中的工具调用
   * @param stepId 步骤 ID
   * @param toolId 工具 ID（可选，不提供则取消该步骤的所有调用）
   */
  cancelPendingCalls(stepId: string, toolId?: string): void {
    const toCancel: string[] = [];

    for (const [callId, call] of this.pendingCalls) {
      if (call.stepId === stepId && (!toolId || call.toolId === toolId)) {
        toCancel.push(callId);
      }
    }

    for (const callId of toCancel) {
      const call = this.pendingCalls.get(callId);
      if (call) {
        call.reject(new Error('工具调用已取消'));
      }
    }
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    toolId: string,
    stepId?: string
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(`工具 ${toolId} 执行超时`, stepId || '', timeout));
        }, timeout);
      }),
    ]);
  }

  /**
   * 生成唯一调用 ID
   * 注意：对于同一个 stepId 和 toolId 组合，生成相同的 ID 以便响应匹配
   */
  private generateCallId(toolId: string, stepId?: string): string {
    // 使用固定格式，不包含计数器，以便响应时能匹配
    return `${stepId || 'global'}_${toolId}`;
  }

  /**
   * 发出工具事件
   */
  private emitToolEvent(
    type: EventType,
    toolId: string,
    stepId?: string,
    payload?: unknown
  ): void {
    const event = createWorkflowEvent(
      type,
      this.workflowId,
      this.instanceId,
      { toolId, ...payload as object },
      stepId
    );
    this.eventEmitter.emit(event);
  }
}

/**
 * 批量执行工具调用
 * 按顺序执行步骤配置的所有工具调用
 * 
 * @param invoker 工具调用器
 * @param invocations 工具调用配置列表
 * @param context 工作流上下文
 * @param stepId 步骤 ID
 * @returns 所有工具调用结果
 */
export async function executeToolInvocations(
  invoker: ToolInvoker,
  invocations: ToolInvocation[],
  context: Context,
  stepId: string
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];

  for (const invocation of invocations) {
    const result = await invoker.invoke(
      invocation.toolId,
      invocation.params,
      context,
      stepId
    );

    results.push(result);

    // 如果工具调用成功且配置了 outputKey，将结果存储到上下文
    if (result.success && invocation.outputKey) {
      context.setGlobal(invocation.outputKey, result.result);
    }

    // 如果工具调用失败，停止后续调用
    if (!result.success) {
      break;
    }
  }

  return results;
}
