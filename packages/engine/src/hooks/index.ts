/**
 * Hook 管理模块
 * 负责管理和执行工作流中的 Hook（钩子）
 */

import type {
  HookHandler,
  HookDefinition,
  HookContext as IHookContext,
  Context,
  HookFn,
} from '@flowify/core';
import { HookExecutionError } from '@flowify/core';

/**
 * Hook 上下文实现类
 * 提供 Hook 执行时所需的上下文信息和操作方法
 */
export class HookContext implements IHookContext {
  /** 步骤 ID */
  public readonly stepId: string;
  
  /** 步骤输入（可被修改） */
  private _stepInput: unknown;
  
  /** 步骤输出（仅 afterHook 可用） */
  public readonly stepOutput?: unknown;
  
  /** 工作流上下文 */
  public readonly context: Context;
  
  /** 输入是否被修改的标记 */
  private _inputModified: boolean = false;

  /**
   * 创建 Hook 上下文
   * @param stepId 步骤 ID
   * @param stepInput 步骤输入
   * @param context 工作流上下文
   * @param stepOutput 步骤输出（可选，仅 afterHook 使用）
   */
  constructor(
    stepId: string,
    stepInput: unknown,
    context: Context,
    stepOutput?: unknown
  ) {
    this.stepId = stepId;
    this._stepInput = stepInput;
    this.context = context;
    this.stepOutput = stepOutput;
  }

  /**
   * 获取步骤输入
   */
  get stepInput(): unknown {
    return this._stepInput;
  }

  /**
   * 修改步骤输入
   * 允许 beforeHook 修改传递给步骤的输入参数
   * @param newInput 新的输入值
   */
  modifyInput(newInput: unknown): void {
    this._stepInput = newInput;
    this._inputModified = true;
  }

  /**
   * 检查输入是否被修改
   */
  isInputModified(): boolean {
    return this._inputModified;
  }

  /**
   * 获取当前（可能已修改的）输入
   */
  getModifiedInput(): unknown {
    return this._stepInput;
  }
}

/**
 * Hook 执行结果
 */
export interface HookExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 修改后的输入（如果有修改） */
  modifiedInput?: unknown;
  /** 错误信息（如果失败） */
  error?: HookExecutionError;
}

/**
 * Hook 管理器
 * 负责全局 Hook 和步骤级 Hook 的注册、管理和执行
 */
export class HookManager {
  /** 全局 beforeHook 列表 */
  private globalBeforeHooks: HookHandler[] = [];
  
  /** 全局 afterHook 列表 */
  private globalAfterHooks: HookHandler[] = [];

  /**
   * 添加全局 beforeHook
   * @param handler Hook 处理器
   */
  addGlobalBeforeHook(handler: HookHandler): void {
    // 检查是否已存在相同 ID 的 Hook
    if (this.globalBeforeHooks.some(h => h.id === handler.id)) {
      return;
    }
    this.globalBeforeHooks.push(handler);
  }

  /**
   * 添加全局 afterHook
   * @param handler Hook 处理器
   */
  addGlobalAfterHook(handler: HookHandler): void {
    // 检查是否已存在相同 ID 的 Hook
    if (this.globalAfterHooks.some(h => h.id === handler.id)) {
      return;
    }
    this.globalAfterHooks.push(handler);
  }

  /**
   * 添加全局 Hook（统一接口）
   * @param type Hook 类型（'before' 或 'after'）
   * @param handler Hook 处理器
   */
  addGlobalHook(type: 'before' | 'after', handler: HookHandler): void {
    if (type === 'before') {
      this.addGlobalBeforeHook(handler);
    } else {
      this.addGlobalAfterHook(handler);
    }
  }

  /**
   * 移除全局 Hook
   * @param hookId Hook ID
   */
  removeGlobalHook(hookId: string): void {
    this.globalBeforeHooks = this.globalBeforeHooks.filter(h => h.id !== hookId);
    this.globalAfterHooks = this.globalAfterHooks.filter(h => h.id !== hookId);
  }

  /**
   * 获取所有全局 beforeHook
   */
  getGlobalBeforeHooks(): HookHandler[] {
    return [...this.globalBeforeHooks];
  }

  /**
   * 获取所有全局 afterHook
   */
  getGlobalAfterHooks(): HookHandler[] {
    return [...this.globalAfterHooks];
  }

  /**
   * 执行 beforeHook 序列
   * 执行顺序：全局 beforeHook → 步骤 beforeHook
   * 如果任何 beforeHook 失败，将阻止步骤执行
   * 
   * @param stepId 步骤 ID
   * @param stepInput 步骤输入
   * @param context 工作流上下文
   * @param stepHooks 步骤级 Hook 定义（可选）
   * @returns Hook 执行结果
   */
  async executeBeforeHooks(
    stepId: string,
    stepInput: unknown,
    context: Context,
    stepHooks?: HookDefinition
  ): Promise<HookExecutionResult> {
    // 创建 Hook 上下文
    const hookContext = new HookContext(stepId, stepInput, context);

    // 按顺序执行：全局 beforeHook → 步骤 beforeHook
    const hooksToExecute: HookHandler[] = [
      ...this.globalBeforeHooks,
      ...(stepHooks?.beforeHooks || []),
    ];

    // 依次执行所有 beforeHook
    for (const hook of hooksToExecute) {
      try {
        await hook.handler(hookContext);
      } catch (error) {
        // beforeHook 失败，返回错误并阻止步骤执行
        const hookError = new HookExecutionError(
          hook.id,
          'before',
          stepId,
          error instanceof Error ? error : new Error(String(error))
        );
        return {
          success: false,
          error: hookError,
        };
      }
    }

    // 所有 beforeHook 执行成功
    return {
      success: true,
      modifiedInput: hookContext.isInputModified()
        ? hookContext.getModifiedInput()
        : stepInput,
    };
  }

  /**
   * 执行 afterHook 序列
   * 执行顺序：步骤 afterHook → 全局 afterHook
   * afterHook 失败不会影响步骤结果，但会记录错误
   * 
   * @param stepId 步骤 ID
   * @param stepInput 步骤输入
   * @param stepOutput 步骤输出
   * @param context 工作流上下文
   * @param stepHooks 步骤级 Hook 定义（可选）
   * @returns Hook 执行结果
   */
  async executeAfterHooks(
    stepId: string,
    stepInput: unknown,
    stepOutput: unknown,
    context: Context,
    stepHooks?: HookDefinition
  ): Promise<HookExecutionResult> {
    // 创建 Hook 上下文（包含步骤输出）
    const hookContext = new HookContext(stepId, stepInput, context, stepOutput);

    // 按顺序执行：步骤 afterHook → 全局 afterHook
    const hooksToExecute: HookHandler[] = [
      ...(stepHooks?.afterHooks || []),
      ...this.globalAfterHooks,
    ];

    // 收集执行过程中的错误
    const errors: HookExecutionError[] = [];

    // 依次执行所有 afterHook
    for (const hook of hooksToExecute) {
      try {
        await hook.handler(hookContext);
      } catch (error) {
        // afterHook 失败，记录错误但继续执行
        const hookError = new HookExecutionError(
          hook.id,
          'after',
          stepId,
          error instanceof Error ? error : new Error(String(error))
        );
        errors.push(hookError);
      }
    }

    // afterHook 失败不影响步骤结果
    return {
      success: true,
      error: errors.length > 0 ? errors[0] : undefined,
    };
  }

  /**
   * 清除所有全局 Hook
   */
  clearGlobalHooks(): void {
    this.globalBeforeHooks = [];
    this.globalAfterHooks = [];
  }
}
