/**
 * 执行器模块
 * 负责执行工作流步骤，包括重试策略、跳过策略和 Hook 执行
 */

import type {
  StepDefinition,
  RetryPolicy,
  SkipPolicy,
  Context,
} from '@flowify/core';
import { StepStatus, StepExecutionError } from '@flowify/core';
import { HookManager } from '../hooks';
import { EventEmitter, EventType, createWorkflowEvent } from '../events';

// ============ 重试策略相关 ============

/**
 * 重试策略执行器
 * 负责计算重试间隔和控制重试次数
 */
export class RetryStrategy {
  /** 重试策略配置 */
  private policy: RetryPolicy;
  
  /** 当前重试次数 */
  private currentRetryCount: number = 0;

  /**
   * 创建重试策略执行器
   * @param policy 重试策略配置
   */
  constructor(policy: RetryPolicy) {
    this.policy = policy;
  }

  /**
   * 检查是否可以重试
   * @returns 是否可以继续重试
   */
  canRetry(): boolean {
    return this.currentRetryCount < this.policy.maxRetries;
  }

  /**
   * 获取当前重试次数
   */
  getRetryCount(): number {
    return this.currentRetryCount;
  }

  /**
   * 获取最大重试次数
   */
  getMaxRetries(): number {
    return this.policy.maxRetries;
  }

  /**
   * 计算下一次重试的间隔时间（毫秒）
   * 如果启用指数退避，间隔 = 基础间隔 × 退避倍数^(重试次数-1)
   * @returns 重试间隔时间（毫秒）
   */
  getNextRetryInterval(): number {
    const baseInterval = this.policy.retryInterval;
    
    if (!this.policy.exponentialBackoff) {
      return baseInterval;
    }

    // 指数退避计算
    // 第 1 次重试：baseInterval × multiplier^0 = baseInterval
    // 第 2 次重试：baseInterval × multiplier^1
    // 第 N 次重试：baseInterval × multiplier^(N-1)
    const multiplier = this.policy.backoffMultiplier ?? 2;
    const exponent = this.currentRetryCount; // 当前重试次数作为指数
    
    return baseInterval * Math.pow(multiplier, exponent);
  }

  /**
   * 记录一次重试
   */
  recordRetry(): void {
    this.currentRetryCount++;
  }

  /**
   * 重置重试计数
   */
  reset(): void {
    this.currentRetryCount = 0;
  }

  /**
   * 等待重试间隔
   * @returns Promise，在间隔时间后 resolve
   */
  async waitForRetry(): Promise<void> {
    const interval = this.getNextRetryInterval();
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * 创建默认重试策略
 * @returns 默认重试策略配置
 */
export function createDefaultRetryPolicy(): RetryPolicy {
  return {
    maxRetries: 3,
    retryInterval: 1000,
    exponentialBackoff: false,
  };
}

// ============ 跳过策略相关 ============

/**
 * 跳过策略执行器
 * 负责评估跳过条件和处理默认输出
 */
export class SkipStrategy {
  /** 跳过策略配置 */
  private policy: SkipPolicy;

  /**
   * 创建跳过策略执行器
   * @param policy 跳过策略配置
   */
  constructor(policy: SkipPolicy) {
    this.policy = policy;
  }

  /**
   * 评估跳过条件
   * @param context 工作流上下文
   * @returns 是否应该跳过步骤
   */
  shouldSkip(context: Context): boolean {
    const { condition } = this.policy;

    // 如果条件是函数，直接调用
    if (typeof condition === 'function') {
      return condition(context);
    }

    // 如果条件是字符串表达式，进行求值
    return this.evaluateConditionExpression(condition, context);
  }

  /**
   * 获取跳过时的默认输出
   * @returns 默认输出值
   */
  getDefaultOutput(): unknown {
    return this.policy.defaultOutput;
  }

  /**
   * 评估条件表达式
   * 支持简单的表达式求值，基于上下文数据
   * @param expression 条件表达式字符串
   * @param context 工作流上下文
   * @returns 表达式求值结果
   */
  private evaluateConditionExpression(expression: string, context: Context): boolean {
    // 创建安全的求值环境
    // 提供 ctx 对象用于访问上下文数据
    const ctx = {
      getStepOutput: (stepId: string) => context.getStepOutput(stepId),
      getGlobal: (key: string) => context.getGlobal(key),
      stepOutputs: context.snapshot().stepOutputs,
      globals: context.snapshot().globals,
    };

    try {
      // 使用 Function 构造器创建安全的求值函数
      // 注意：这里假设表达式是可信的，实际生产环境需要更严格的安全措施
      const evalFn = new Function('ctx', `return ${expression}`);
      const result = evalFn(ctx);
      return Boolean(result);
    } catch (error) {
      // 表达式求值失败，默认不跳过
      console.warn(`跳过条件表达式求值失败: ${expression}`, error);
      return false;
    }
  }
}

// ============ 步骤执行结果 ============

/**
 * 步骤执行结果
 */
export interface StepResult {
  /** 步骤 ID */
  stepId: string;
  /** 执行状态 */
  status: StepStatus;
  /** 步骤输出 */
  output?: unknown;
  /** 错误信息 */
  error?: Error;
  /** 重试次数 */
  retryCount?: number;
}

/**
 * 依赖步骤输入
 * 包含步骤的原始输入和依赖步骤的输出
 */
export interface DependencyInput {
  /** 原始输入 */
  input?: unknown;
  /** 依赖步骤的输出映射 */
  dependencies: Record<string, unknown>;
}

/**
 * 收集依赖步骤的输出
 * 用于在步骤执行时注入依赖步骤的输出数据
 * @param step 步骤定义
 * @param context 工作流上下文
 * @returns 依赖步骤的输出映射
 */
export function collectDependencyOutputs(
  step: StepDefinition,
  context: Context
): Record<string, unknown> {
  const dependencies = step.dependencies || [];
  return context.getDependencyOutputs(dependencies);
}

/**
 * 创建带依赖输出的步骤输入
 * 将原始输入和依赖步骤的输出合并为一个对象
 * @param step 步骤定义
 * @param context 工作流上下文
 * @param input 原始输入
 * @returns 包含依赖输出的输入对象
 */
export function createDependencyInput(
  step: StepDefinition,
  context: Context,
  input?: unknown
): DependencyInput {
  const dependencies = collectDependencyOutputs(step, context);
  return {
    input,
    dependencies,
  };
}

// ============ 步骤执行函数类型 ============

/**
 * 步骤执行函数类型
 * 实际执行步骤逻辑的函数
 */
export type StepExecuteFn = (
  step: StepDefinition,
  input: unknown,
  context: Context
) => Promise<unknown>;

// ============ 执行器类 ============

/**
 * 执行器类
 * 负责执行单个步骤，集成重试策略、跳过策略和 Hook 执行
 */
export class Executor {
  /** Hook 管理器 */
  private hookManager: HookManager;
  
  /** 事件发射器 */
  private eventEmitter: EventEmitter;
  
  /** 工作流 ID */
  private workflowId: string;
  
  /** 实例 ID */
  private instanceId: string;
  
  /** 取消标记映射 */
  private cancelledSteps: Set<string> = new Set();

  /**
   * 创建执行器
   * @param hookManager Hook 管理器
   * @param eventEmitter 事件发射器
   * @param workflowId 工作流 ID
   * @param instanceId 实例 ID
   */
  constructor(
    hookManager: HookManager,
    eventEmitter: EventEmitter,
    workflowId: string,
    instanceId: string
  ) {
    this.hookManager = hookManager;
    this.eventEmitter = eventEmitter;
    this.workflowId = workflowId;
    this.instanceId = instanceId;
  }

  /**
   * 执行单个步骤
   * 集成跳过策略、Hook 执行和重试策略
   * 
   * @param step 步骤定义
   * @param context 工作流上下文
   * @param executeFn 步骤执行函数
   * @param input 步骤输入（可选）
   * @returns 步骤执行结果
   */
  async executeStep(
    step: StepDefinition,
    context: Context,
    executeFn: StepExecuteFn,
    input?: unknown
  ): Promise<StepResult> {
    const { id: stepId, skipPolicy, retryPolicy, hooks } = step;

    // 检查是否已取消
    if (this.cancelledSteps.has(stepId)) {
      return {
        stepId,
        status: StepStatus.FAILED,
        error: new Error('步骤已被取消'),
      };
    }

    // 1. 检查跳过策略
    if (skipPolicy) {
      const skipStrategy = new SkipStrategy(skipPolicy);
      if (skipStrategy.shouldSkip(context)) {
        // 发出跳过事件
        this.emitEvent(EventType.STEP_SKIP, stepId, { reason: '满足跳过条件' });
        
        // 设置默认输出到上下文
        const defaultOutput = skipStrategy.getDefaultOutput();
        context.setStepOutput(stepId, defaultOutput);
        
        return {
          stepId,
          status: StepStatus.SKIPPED,
          output: defaultOutput,
        };
      }
    }

    // 2. 执行 beforeHook
    const beforeResult = await this.hookManager.executeBeforeHooks(
      stepId,
      input,
      context,
      hooks
    );

    if (!beforeResult.success) {
      // beforeHook 失败，阻止步骤执行
      this.emitEvent(EventType.STEP_FAILED, stepId, {
        error: beforeResult.error?.message,
        phase: 'beforeHook',
      });
      
      return {
        stepId,
        status: StepStatus.FAILED,
        error: beforeResult.error,
      };
    }

    // 使用可能被修改的输入
    const actualInput = beforeResult.modifiedInput;

    // 3. 执行步骤（带重试）
    const result = await this.executeWithRetry(
      step,
      context,
      executeFn,
      actualInput,
      retryPolicy
    );

    // 4. 如果步骤成功，执行 afterHook
    if (result.status === StepStatus.SUCCESS) {
      await this.hookManager.executeAfterHooks(
        stepId,
        actualInput,
        result.output,
        context,
        hooks
      );
      
      // 将输出存储到上下文
      context.setStepOutput(stepId, result.output);
    }

    return result;
  }

  /**
   * 带重试的步骤执行
   * @param step 步骤定义
   * @param context 工作流上下文
   * @param executeFn 步骤执行函数
   * @param input 步骤输入
   * @param retryPolicy 重试策略（可选）
   * @returns 步骤执行结果
   */
  private async executeWithRetry(
    step: StepDefinition,
    context: Context,
    executeFn: StepExecuteFn,
    input: unknown,
    retryPolicy?: RetryPolicy
  ): Promise<StepResult> {
    const { id: stepId } = step;
    
    // 如果没有重试策略，直接执行一次
    if (!retryPolicy) {
      return this.executeSingleAttempt(step, context, executeFn, input);
    }

    const retryStrategy = new RetryStrategy(retryPolicy);
    let lastError: Error | undefined;

    // 首次执行
    this.emitEvent(EventType.STEP_START, stepId, { attempt: 1 });
    
    let result = await this.executeSingleAttempt(step, context, executeFn, input);
    
    if (result.status === StepStatus.SUCCESS) {
      this.emitEvent(EventType.STEP_COMPLETE, stepId, { output: result.output });
      return result;
    }

    lastError = result.error;

    // 重试循环
    while (retryStrategy.canRetry()) {
      // 检查是否已取消
      if (this.cancelledSteps.has(stepId)) {
        return {
          stepId,
          status: StepStatus.FAILED,
          error: new Error('步骤已被取消'),
          retryCount: retryStrategy.getRetryCount(),
        };
      }

      // 等待重试间隔
      await retryStrategy.waitForRetry();
      
      // 记录重试
      retryStrategy.recordRetry();
      
      // 发出重试事件
      this.emitEvent(EventType.STEP_RETRY, stepId, {
        attempt: retryStrategy.getRetryCount() + 1,
        maxRetries: retryStrategy.getMaxRetries(),
        lastError: lastError?.message,
      });

      // 重试执行
      result = await this.executeSingleAttempt(step, context, executeFn, input);
      
      if (result.status === StepStatus.SUCCESS) {
        this.emitEvent(EventType.STEP_COMPLETE, stepId, {
          output: result.output,
          retryCount: retryStrategy.getRetryCount(),
        });
        return {
          ...result,
          retryCount: retryStrategy.getRetryCount(),
        };
      }

      lastError = result.error;
    }

    // 重试次数耗尽，标记为最终失败
    this.emitEvent(EventType.STEP_FAILED, stepId, {
      error: lastError?.message,
      retryCount: retryStrategy.getRetryCount(),
      maxRetries: retryStrategy.getMaxRetries(),
    });

    return {
      stepId,
      status: StepStatus.FAILED,
      error: lastError,
      retryCount: retryStrategy.getRetryCount(),
    };
  }

  /**
   * 执行单次步骤尝试
   * @param step 步骤定义
   * @param context 工作流上下文
   * @param executeFn 步骤执行函数
   * @param input 步骤输入
   * @returns 步骤执行结果
   */
  private async executeSingleAttempt(
    step: StepDefinition,
    context: Context,
    executeFn: StepExecuteFn,
    input: unknown
  ): Promise<StepResult> {
    const { id: stepId } = step;

    try {
      const output = await executeFn(step, input, context);
      return {
        stepId,
        status: StepStatus.SUCCESS,
        output,
      };
    } catch (error) {
      const stepError = error instanceof Error
        ? new StepExecutionError(error.message, stepId, error)
        : new StepExecutionError(String(error), stepId);
      
      return {
        stepId,
        status: StepStatus.FAILED,
        error: stepError,
      };
    }
  }

  /**
   * 取消步骤执行
   * @param stepId 步骤 ID
   */
  async cancelStep(stepId: string): Promise<void> {
    this.cancelledSteps.add(stepId);
  }

  /**
   * 检查步骤是否已取消
   * @param stepId 步骤 ID
   * @returns 是否已取消
   */
  isCancelled(stepId: string): boolean {
    return this.cancelledSteps.has(stepId);
  }

  /**
   * 清除取消标记
   * @param stepId 步骤 ID
   */
  clearCancellation(stepId: string): void {
    this.cancelledSteps.delete(stepId);
  }

  /**
   * 发出事件
   * @param type 事件类型
   * @param stepId 步骤 ID
   * @param payload 事件负载
   */
  private emitEvent(type: EventType, stepId: string, payload: unknown): void {
    const event = createWorkflowEvent(
      type,
      this.workflowId,
      this.instanceId,
      payload,
      stepId
    );
    this.eventEmitter.emit(event);
  }
}
