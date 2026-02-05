/**
 * 上下文管理模块
 * 负责存储和管理工作流执行过程中的状态和数据
 */

import type { Context as IContext, ContextSnapshot } from '@flowify/core';

/**
 * 工作流执行上下文实现类
 * 为每个工作流实例维护独立的执行上下文
 */
export class Context implements IContext {
  /** 工作流定义 ID */
  public readonly workflowId: string;
  
  /** 工作流实例 ID */
  public readonly instanceId: string;
  
  /** 步骤输出存储 */
  private stepOutputs: Map<string, unknown>;
  
  /** 全局变量存储 */
  private globals: Map<string, unknown>;

  /**
   * 创建上下文实例
   * @param workflowId 工作流定义 ID
   * @param instanceId 工作流实例 ID
   */
  constructor(workflowId: string, instanceId: string) {
    this.workflowId = workflowId;
    this.instanceId = instanceId;
    this.stepOutputs = new Map();
    this.globals = new Map();
  }

  /**
   * 获取指定步骤的输出
   * @param stepId 步骤 ID
   * @returns 步骤输出，如果不存在则返回 undefined
   */
  getStepOutput(stepId: string): unknown {
    return this.stepOutputs.get(stepId);
  }

  /**
   * 获取多个依赖步骤的输出
   * 用于在步骤执行时注入依赖步骤的输出数据
   * @param stepIds 步骤 ID 列表
   * @returns 步骤 ID 到输出的映射对象
   */
  getDependencyOutputs(stepIds: string[]): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    for (const stepId of stepIds) {
      const output = this.stepOutputs.get(stepId);
      if (output !== undefined) {
        outputs[stepId] = output;
      }
    }
    return outputs;
  }

  /**
   * 检查指定步骤是否有输出
   * @param stepId 步骤 ID
   * @returns 是否有输出
   */
  hasStepOutput(stepId: string): boolean {
    return this.stepOutputs.has(stepId);
  }

  /**
   * 设置指定步骤的输出
   * @param stepId 步骤 ID
   * @param output 步骤输出值
   */
  setStepOutput(stepId: string, output: unknown): void {
    this.stepOutputs.set(stepId, output);
  }

  /**
   * 获取全局变量
   * @param key 变量名
   * @returns 变量值，如果不存在则返回 undefined
   */
  getGlobal(key: string): unknown {
    return this.globals.get(key);
  }

  /**
   * 设置全局变量
   * @param key 变量名
   * @param value 变量值
   */
  setGlobal(key: string, value: unknown): void {
    this.globals.set(key, value);
  }

  /**
   * 获取上下文数据快照
   * 返回当前所有步骤输出和全局变量的副本
   * @returns 上下文快照对象
   */
  snapshot(): ContextSnapshot {
    // 将 Map 转换为普通对象
    const stepOutputs: Record<string, unknown> = {};
    for (const [key, value] of this.stepOutputs) {
      stepOutputs[key] = value;
    }

    const globals: Record<string, unknown> = {};
    for (const [key, value] of this.globals) {
      globals[key] = value;
    }

    return {
      stepOutputs,
      globals,
    };
  }

  /**
   * 获取所有步骤 ID 列表
   * @returns 步骤 ID 数组
   */
  getStepIds(): string[] {
    return Array.from(this.stepOutputs.keys());
  }

  /**
   * 获取所有全局变量的键列表
   * @returns 全局变量键数组
   */
  getGlobalKeys(): string[] {
    return Array.from(this.globals.keys());
  }

  /**
   * 清除所有步骤输出
   * 注意：通常不应该在工作流完成后调用此方法
   */
  clearStepOutputs(): void {
    this.stepOutputs.clear();
  }

  /**
   * 清除所有全局变量
   * 注意：通常不应该在工作流完成后调用此方法
   */
  clearGlobals(): void {
    this.globals.clear();
  }

  /**
   * 清除所有上下文数据
   * 注意：通常不应该在工作流完成后调用此方法
   */
  clear(): void {
    this.stepOutputs.clear();
    this.globals.clear();
  }

  /**
   * 从快照恢复上下文数据
   * 用于恢复工作流执行状态
   * @param snapshot 上下文快照
   */
  restore(snapshot: ContextSnapshot): void {
    this.stepOutputs.clear();
    this.globals.clear();

    for (const [key, value] of Object.entries(snapshot.stepOutputs)) {
      this.stepOutputs.set(key, value);
    }

    for (const [key, value] of Object.entries(snapshot.globals)) {
      this.globals.set(key, value);
    }
  }
}
