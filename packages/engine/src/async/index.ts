/**
 * 异步等待机制模块
 * 实现步骤等待状态管理、超时处理和等待恢复/取消
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import type { WaitingInfo, StepState } from '@flowify/core';
import { StepStatus, WaitType, TimeoutError } from '@flowify/core';
import { EventEmitter, EventType, createWorkflowEvent } from '../events';

// ============ 超时处理策略 ============

/**
 * 超时处理策略枚举
 */
export enum TimeoutStrategy {
  /** 抛出错误 */
  ERROR = 'error',
  /** 使用默认值继续 */
  DEFAULT = 'default',
  /** 忽略超时，继续等待 */
  IGNORE = 'ignore',
}

/**
 * 超时配置
 */
export interface TimeoutConfig {
  /** 超时时间（毫秒） */
  timeout: number;
  /** 超时处理策略 */
  strategy: TimeoutStrategy;
  /** 默认值（当策略为 DEFAULT 时使用） */
  defaultValue?: unknown;
}

// ============ 等待状态管理器 ============

/**
 * 等待恢复回调函数类型
 */
export type WaitResumeCallback = (result: unknown) => void;

/**
 * 等待取消回调函数类型
 */
export type WaitCancelCallback = (reason: string) => void;

/**
 * 等待超时回调函数类型
 */
export type WaitTimeoutCallback = () => void;

/**
 * 等待项
 * 存储单个等待操作的完整信息
 */
export interface WaitItem {
  /** 步骤 ID */
  stepId: string;
  /** 等待信息 */
  waitingInfo: WaitingInfo;
  /** 恢复回调 */
  onResume: WaitResumeCallback;
  /** 取消回调 */
  onCancel: WaitCancelCallback;
  /** 超时回调 */
  onTimeout?: WaitTimeoutCallback;
  /** 超时定时器 ID */
  timeoutId?: ReturnType<typeof setTimeout>;
  /** 超时配置 */
  timeoutConfig?: TimeoutConfig;
}

/**
 * 等待状态管理器
 * 负责管理步骤的等待状态、超时处理和恢复/取消操作
 */
export class WaitManager {
  /** 事件发射器 */
  private eventEmitter: EventEmitter;
  
  /** 工作流 ID */
  private workflowId: string;
  
  /** 实例 ID */
  private instanceId: string;
  
  /** 等待项映射（stepId -> WaitItem） */
  private waitingItems: Map<string, WaitItem> = new Map();
  
  /** 步骤状态映射（stepId -> StepState） */
  private stepStates: Map<string, StepState> = new Map();

  /**
   * 创建等待状态管理器
   * @param eventEmitter 事件发射器
   * @param workflowId 工作流 ID
   * @param instanceId 实例 ID
   */
  constructor(
    eventEmitter: EventEmitter,
    workflowId: string,
    instanceId: string
  ) {
    this.eventEmitter = eventEmitter;
    this.workflowId = workflowId;
    this.instanceId = instanceId;
  }

  /**
   * 开始等待
   * 将步骤标记为等待状态，并设置超时处理
   * 
   * Requirements: 4.1, 4.2
   * 
   * @param stepId 步骤 ID
   * @param type 等待类型
   * @param targetId 等待目标 ID
   * @param timeout 超时时间（毫秒），undefined 表示无超时
   * @param data 额外数据
   * @returns Promise，在等待恢复或取消时 resolve/reject
   */
  startWait(
    stepId: string,
    type: WaitType,
    targetId: string,
    timeout?: number,
    data?: unknown
  ): Promise<unknown> {
    // 使用默认的超时策略（抛出错误）
    const timeoutConfig = timeout !== undefined ? {
      timeout,
      strategy: TimeoutStrategy.ERROR,
    } : undefined;

    return this.startWaitWithConfig(stepId, type, targetId, timeoutConfig, data);
  }

  /**
   * 开始等待（带超时配置）
   * 支持自定义超时处理策略
   * 
   * Requirements: 4.2, 4.3
   * 
   * @param stepId 步骤 ID
   * @param type 等待类型
   * @param targetId 等待目标 ID
   * @param timeoutConfig 超时配置
   * @param data 额外数据
   * @returns Promise，在等待恢复或取消时 resolve/reject
   */
  startWaitWithConfig(
    stepId: string,
    type: WaitType,
    targetId: string,
    timeoutConfig?: TimeoutConfig,
    data?: unknown
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      // 创建等待信息
      const waitingInfo: WaitingInfo = {
        type,
        targetId,
        startTime,
        timeout: timeoutConfig?.timeout,
        data,
      };

      // 更新步骤状态为等待输入
      this.updateStepState(stepId, {
        stepId,
        status: StepStatus.WAITING_INPUT,
        retryCount: 0,
        startTime,
        waitingFor: waitingInfo,
      });

      // 创建等待项
      const waitItem: WaitItem = {
        stepId,
        waitingInfo,
        timeoutConfig,
        onResume: (result: unknown) => {
          this.clearWaitItem(stepId);
          resolve(result);
        },
        onCancel: (reason: string) => {
          this.clearWaitItem(stepId);
          reject(new Error(reason));
        },
        onTimeout: () => {
          this.handleTimeout(stepId, waitItem, resolve, reject);
        },
      };

      // 如果配置了超时，设置超时定时器
      if (timeoutConfig && timeoutConfig.timeout > 0) {
        waitItem.timeoutId = setTimeout(() => {
          if (this.waitingItems.has(stepId)) {
            // 发出超时事件
            this.emitWaitEvent(EventType.WAIT_TIMEOUT, stepId, {
              type,
              targetId,
              timeout: timeoutConfig.timeout,
              strategy: timeoutConfig.strategy,
              elapsedTime: Date.now() - startTime,
            });
            
            // 调用超时回调
            waitItem.onTimeout?.();
          }
        }, timeoutConfig.timeout);
      }

      // 存储等待项
      this.waitingItems.set(stepId, waitItem);

      // 发出等待开始事件
      this.emitWaitEvent(EventType.WAIT_START, stepId, {
        type,
        targetId,
        timeout: timeoutConfig?.timeout,
      });
    });
  }

  /**
   * 处理超时
   * 根据超时策略执行不同的处理逻辑
   * 
   * Requirements: 4.3
   * 
   * @param stepId 步骤 ID
   * @param waitItem 等待项
   * @param resolve Promise resolve 函数
   * @param reject Promise reject 函数
   */
  private handleTimeout(
    stepId: string,
    waitItem: WaitItem,
    resolve: (value: unknown) => void,
    reject: (reason: Error) => void
  ): void {
    const { timeoutConfig } = waitItem;
    const strategy = timeoutConfig?.strategy ?? TimeoutStrategy.ERROR;

    this.clearWaitItem(stepId);

    switch (strategy) {
      case TimeoutStrategy.ERROR:
        // 抛出超时错误
        reject(new TimeoutError(
          `步骤 ${stepId} 等待超时`,
          stepId,
          timeoutConfig!.timeout
        ));
        break;

      case TimeoutStrategy.DEFAULT:
        // 使用默认值继续
        resolve(timeoutConfig?.defaultValue);
        break;

      case TimeoutStrategy.IGNORE:
        // 忽略超时，重新开始等待（不清除等待项）
        // 注意：这种情况下需要重新设置定时器
        this.restartWaitTimer(stepId, waitItem, resolve, reject);
        break;
    }
  }

  /**
   * 重新启动等待定时器
   * 用于 IGNORE 策略
   */
  private restartWaitTimer(
    stepId: string,
    waitItem: WaitItem,
    resolve: (value: unknown) => void,
    reject: (reason: Error) => void
  ): void {
    const { timeoutConfig, waitingInfo } = waitItem;
    
    if (!timeoutConfig || timeoutConfig.timeout <= 0) {
      return;
    }

    // 重新添加等待项
    this.waitingItems.set(stepId, waitItem);

    // 设置新的超时定时器
    waitItem.timeoutId = setTimeout(() => {
      if (this.waitingItems.has(stepId)) {
        // 发出超时事件
        this.emitWaitEvent(EventType.WAIT_TIMEOUT, stepId, {
          type: waitingInfo.type,
          targetId: waitingInfo.targetId,
          timeout: timeoutConfig.timeout,
          strategy: timeoutConfig.strategy,
          elapsedTime: Date.now() - waitingInfo.startTime,
          ignored: true,
        });
        
        // 递归处理超时
        this.handleTimeout(stepId, waitItem, resolve, reject);
      }
    }, timeoutConfig.timeout);
  }

  /**
   * 恢复等待
   * 提供等待结果，恢复步骤执行
   * 
   * Requirements: 4.4
   * 
   * @param stepId 步骤 ID
   * @param result 等待结果
   * @returns 是否成功恢复
   */
  resumeWait(stepId: string, result: unknown): boolean {
    const waitItem = this.waitingItems.get(stepId);
    
    if (!waitItem) {
      return false;
    }

    // 发出恢复事件
    this.emitWaitEvent(EventType.WAIT_RESUME, stepId, {
      type: waitItem.waitingInfo.type,
      targetId: waitItem.waitingInfo.targetId,
      elapsedTime: Date.now() - waitItem.waitingInfo.startTime,
      result,
    });

    // 调用恢复回调
    waitItem.onResume(result);
    
    return true;
  }

  /**
   * 取消等待
   * 取消步骤的等待状态
   * 
   * Requirements: 4.5
   * 
   * @param stepId 步骤 ID
   * @param reason 取消原因
   * @returns 是否成功取消
   */
  cancelWait(stepId: string, reason: string = '等待已取消'): boolean {
    const waitItem = this.waitingItems.get(stepId);
    
    if (!waitItem) {
      return false;
    }

    // 发出取消事件
    this.emitWaitEvent(EventType.WAIT_CANCEL, stepId, {
      type: waitItem.waitingInfo.type,
      targetId: waitItem.waitingInfo.targetId,
      elapsedTime: Date.now() - waitItem.waitingInfo.startTime,
      reason,
    });

    // 调用取消回调
    waitItem.onCancel(reason);
    
    return true;
  }

  /**
   * 检查步骤是否在等待中
   * @param stepId 步骤 ID
   * @returns 是否在等待中
   */
  isWaiting(stepId: string): boolean {
    return this.waitingItems.has(stepId);
  }

  /**
   * 获取步骤的等待信息
   * @param stepId 步骤 ID
   * @returns 等待信息，如果不在等待中则返回 undefined
   */
  getWaitingInfo(stepId: string): WaitingInfo | undefined {
    return this.waitingItems.get(stepId)?.waitingInfo;
  }

  /**
   * 获取步骤的剩余等待时间
   * @param stepId 步骤 ID
   * @returns 剩余时间（毫秒），如果无超时或不在等待中则返回 undefined
   */
  getRemainingTime(stepId: string): number | undefined {
    const waitItem = this.waitingItems.get(stepId);
    if (!waitItem || !waitItem.timeoutConfig) {
      return undefined;
    }

    const elapsed = Date.now() - waitItem.waitingInfo.startTime;
    const remaining = waitItem.timeoutConfig.timeout - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * 获取所有等待中的步骤 ID
   * @returns 等待中的步骤 ID 列表
   */
  getWaitingStepIds(): string[] {
    return Array.from(this.waitingItems.keys());
  }

  /**
   * 获取等待中的步骤数量
   * @returns 等待中的步骤数量
   */
  getWaitingCount(): number {
    return this.waitingItems.size;
  }

  /**
   * 获取步骤状态
   * @param stepId 步骤 ID
   * @returns 步骤状态
   */
  getStepState(stepId: string): StepState | undefined {
    return this.stepStates.get(stepId);
  }

  /**
   * 更新步骤状态
   * @param stepId 步骤 ID
   * @param state 步骤状态
   */
  updateStepState(stepId: string, state: StepState): void {
    this.stepStates.set(stepId, state);
  }

  /**
   * 获取所有步骤状态
   * @returns 步骤状态映射
   */
  getAllStepStates(): Map<string, StepState> {
    return new Map(this.stepStates);
  }

  /**
   * 取消所有等待
   * 用于工作流取消时清理所有等待状态
   * @param reason 取消原因
   */
  cancelAllWaits(reason: string = '工作流已取消'): void {
    const stepIds = Array.from(this.waitingItems.keys());
    for (const stepId of stepIds) {
      this.cancelWait(stepId, reason);
    }
  }

  /**
   * 延长等待超时时间
   * @param stepId 步骤 ID
   * @param additionalTime 额外时间（毫秒）
   * @returns 是否成功延长
   */
  extendTimeout(stepId: string, additionalTime: number): boolean {
    const waitItem = this.waitingItems.get(stepId);
    
    if (!waitItem || !waitItem.timeoutConfig || !waitItem.timeoutId) {
      return false;
    }

    // 清除当前定时器
    clearTimeout(waitItem.timeoutId);

    // 计算新的超时时间
    const elapsed = Date.now() - waitItem.waitingInfo.startTime;
    const newTimeout = waitItem.timeoutConfig.timeout + additionalTime;
    const remainingTime = newTimeout - elapsed;

    if (remainingTime <= 0) {
      // 已经超时，立即触发
      waitItem.onTimeout?.();
      return true;
    }

    // 更新超时配置
    waitItem.timeoutConfig.timeout = newTimeout;
    waitItem.waitingInfo.timeout = newTimeout;

    // 设置新的定时器
    waitItem.timeoutId = setTimeout(() => {
      if (this.waitingItems.has(stepId)) {
        this.emitWaitEvent(EventType.WAIT_TIMEOUT, stepId, {
          type: waitItem.waitingInfo.type,
          targetId: waitItem.waitingInfo.targetId,
          timeout: newTimeout,
          strategy: waitItem.timeoutConfig!.strategy,
          elapsedTime: Date.now() - waitItem.waitingInfo.startTime,
        });
        waitItem.onTimeout?.();
      }
    }, remainingTime);

    return true;
  }

  /**
   * 清除等待项
   * @param stepId 步骤 ID
   */
  private clearWaitItem(stepId: string): void {
    const waitItem = this.waitingItems.get(stepId);
    
    if (waitItem) {
      // 清除超时定时器
      if (waitItem.timeoutId) {
        clearTimeout(waitItem.timeoutId);
      }
      
      // 移除等待项
      this.waitingItems.delete(stepId);
      
      // 更新步骤状态，移除等待信息
      const currentState = this.stepStates.get(stepId);
      if (currentState) {
        this.stepStates.set(stepId, {
          ...currentState,
          waitingFor: undefined,
        });
      }
    }
  }

  /**
   * 发出等待事件
   * @param type 事件类型
   * @param stepId 步骤 ID
   * @param payload 事件负载
   */
  private emitWaitEvent(type: EventType, stepId: string, payload: unknown): void {
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

/**
 * 创建等待信息的辅助函数
 * @param type 等待类型
 * @param targetId 等待目标 ID
 * @param timeout 超时时间
 * @param data 额外数据
 * @returns 等待信息
 */
export function createWaitingInfo(
  type: WaitType,
  targetId: string,
  timeout?: number,
  data?: unknown
): WaitingInfo {
  return {
    type,
    targetId,
    startTime: Date.now(),
    timeout,
    data,
  };
}

/**
 * 创建超时配置的辅助函数
 * @param timeout 超时时间（毫秒）
 * @param strategy 超时处理策略
 * @param defaultValue 默认值（当策略为 DEFAULT 时使用）
 * @returns 超时配置
 */
export function createTimeoutConfig(
  timeout: number,
  strategy: TimeoutStrategy = TimeoutStrategy.ERROR,
  defaultValue?: unknown
): TimeoutConfig {
  return {
    timeout,
    strategy,
    defaultValue,
  };
}
