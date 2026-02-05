/**
 * 事件系统模块
 * 实现事件发布订阅机制，用于引擎与外部系统通信
 */

import { StepStatus } from '../core/types';

// ============ 事件类型枚举 ============

/**
 * 事件类型枚举
 * 定义工作流引擎支持的所有事件类型
 */
export enum EventType {
  // 工作流级别事件
  /** 工作流开始 */
  WORKFLOW_START = 'workflow:start',
  /** 工作流完成 */
  WORKFLOW_COMPLETE = 'workflow:complete',
  /** 工作流失败 */
  WORKFLOW_FAILED = 'workflow:failed',

  // 步骤级别事件
  /** 步骤开始 */
  STEP_START = 'step:start',
  /** 步骤完成 */
  STEP_COMPLETE = 'step:complete',
  /** 步骤失败 */
  STEP_FAILED = 'step:failed',
  /** 步骤重试 */
  STEP_RETRY = 'step:retry',
  /** 步骤跳过 */
  STEP_SKIP = 'step:skip',

  // 进度事件
  /** 进度更新 */
  PROGRESS_UPDATE = 'progress:update',
  /** 步骤条更新 */
  STEP_BAR_UPDATE = 'stepbar:update',

  // UI 事件
  /** UI 渲染 */
  UI_RENDER = 'ui:render',
  /** UI 响应 */
  UI_RESPONSE = 'ui:response',

  // 工具事件
  /** 工具调用 */
  TOOL_INVOKE = 'tool:invoke',
  /** 工具完成 */
  TOOL_COMPLETE = 'tool:complete',
  /** 工具失败 */
  TOOL_FAILED = 'tool:failed',

  // 等待事件
  /** 等待开始 */
  WAIT_START = 'wait:start',
  /** 等待超时 */
  WAIT_TIMEOUT = 'wait:timeout',
  /** 等待恢复 */
  WAIT_RESUME = 'wait:resume',
  /** 等待取消 */
  WAIT_CANCEL = 'wait:cancel',
}

// ============ 事件负载接口 ============

/**
 * 进度事件负载
 */
export interface ProgressPayload {
  /** 当前步骤 */
  currentStep: string;
  /** 总步骤数 */
  totalSteps: number;
  /** 已完成步骤数 */
  completedSteps: number;
  /** 执行百分比 */
  percentage: number;
}

/**
 * 步骤条项
 */
export interface StepBarItem {
  id: string;
  name: string;
  status: StepStatus;
}

/**
 * 步骤条事件负载
 */
export interface StepBarPayload {
  /** 所有步骤状态列表 */
  steps: StepBarItem[];
  /** 当前活动步骤 ID */
  activeStepId: string;
}

// ============ 工作流事件接口 ============

/**
 * 基础事件结构
 * 所有事件都应包含这些基本信息
 */
export interface WorkflowEvent<T = unknown> {
  /** 事件类型 */
  type: EventType;
  /** 时间戳 */
  timestamp: number;
  /** 工作流 ID */
  workflowId: string;
  /** 实例 ID */
  instanceId: string;
  /** 步骤 ID（可选，步骤级别事件需要） */
  stepId?: string;
  /** 事件负载数据 */
  payload: T;
}

// ============ 事件监听器类型 ============

/**
 * 事件监听器函数类型
 */
export type EventListener<T = unknown> = (event: WorkflowEvent<T>) => void;

// ============ EventEmitter 类 ============

/**
 * 事件发射器类
 * 实现事件的发布订阅机制
 */
export class EventEmitter {
  /** 事件监听器映射表 */
  private listeners: Map<EventType, Set<EventListener>> = new Map();

  /**
   * 注册事件监听器
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  on<T = unknown>(eventType: EventType, listener: EventListener<T>): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener as EventListener);
  }

  /**
   * 移除事件监听器
   * @param eventType 事件类型
   * @param listener 监听器函数
   * @returns 是否成功移除
   */
  off<T = unknown>(eventType: EventType, listener: EventListener<T>): boolean {
    const eventListeners = this.listeners.get(eventType);
    if (!eventListeners) {
      return false;
    }
    return eventListeners.delete(listener as EventListener);
  }

  /**
   * 发出事件
   * 通知所有注册的监听器
   * @param event 事件对象
   */
  emit<T = unknown>(event: WorkflowEvent<T>): void {
    const eventListeners = this.listeners.get(event.type);
    if (!eventListeners) {
      return;
    }
    // 遍历所有监听器并调用
    for (const listener of eventListeners) {
      listener(event as WorkflowEvent);
    }
  }

  /**
   * 获取指定事件类型的监听器数量
   * @param eventType 事件类型
   * @returns 监听器数量
   */
  listenerCount(eventType: EventType): number {
    const eventListeners = this.listeners.get(eventType);
    return eventListeners ? eventListeners.size : 0;
  }

  /**
   * 移除指定事件类型的所有监听器
   * @param eventType 事件类型
   */
  removeAllListeners(eventType?: EventType): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * 检查是否有指定事件类型的监听器
   * @param eventType 事件类型
   * @returns 是否有监听器
   */
  hasListeners(eventType: EventType): boolean {
    const eventListeners = this.listeners.get(eventType);
    return eventListeners !== undefined && eventListeners.size > 0;
  }
}

/**
 * 创建工作流事件的辅助函数
 * @param type 事件类型
 * @param workflowId 工作流 ID
 * @param instanceId 实例 ID
 * @param payload 事件负载
 * @param stepId 步骤 ID（可选）
 * @returns 工作流事件对象
 */
export function createWorkflowEvent<T>(
  type: EventType,
  workflowId: string,
  instanceId: string,
  payload: T,
  stepId?: string
): WorkflowEvent<T> {
  return {
    type,
    timestamp: Date.now(),
    workflowId,
    instanceId,
    stepId,
    payload,
  };
}
