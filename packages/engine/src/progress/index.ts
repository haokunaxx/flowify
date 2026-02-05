/**
 * 进度管理模块
 * 负责工作流执行进度跟踪、状态暴露和生命周期事件
 */

import type { StepDefinition, WorkflowDefinition } from '@flowify/core';
import { StepStatus, WorkflowStatus } from '@flowify/core';
import {
  EventEmitter,
  EventType,
  createWorkflowEvent,
  type ProgressPayload,
  type StepBarPayload,
  type StepBarItem,
} from '../events';

// ============ 步骤状态管理 ============

/**
 * 步骤运行时状态（用于进度跟踪）
 */
export interface StepProgressState {
  /** 步骤 ID */
  stepId: string;
  /** 步骤名称 */
  name: string;
  /** 当前状态 */
  status: StepStatus;
}

// ============ 进度管理器类 ============

/**
 * 进度管理器
 * 负责跟踪工作流执行进度，发出进度事件和步骤条状态更新事件
 */
export class ProgressManager {
  /** 事件发射器 */
  private eventEmitter: EventEmitter;

  /** 工作流 ID */
  private workflowId: string;

  /** 实例 ID */
  private instanceId: string;

  /** 步骤状态映射：stepId -> StepProgressState */
  private stepStates: Map<string, StepProgressState> = new Map();

  /** 总步骤数 */
  private totalSteps: number = 0;

  /** 当前活动步骤 ID */
  private activeStepId: string = '';

  /** 工作流状态 */
  private workflowStatus: WorkflowStatus = WorkflowStatus.IDLE;

  /** 上次发出的进度百分比（用于去重） */
  private lastEmittedPercentage: number = -1;

  /**
   * 创建进度管理器
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
   * 初始化进度管理器
   * 根据工作流定义初始化所有步骤状态
   * @param definition 工作流定义
   */
  initialize(definition: WorkflowDefinition): void {
    this.stepStates.clear();
    this.totalSteps = definition.steps.length;

    for (const step of definition.steps) {
      this.stepStates.set(step.id, {
        stepId: step.id,
        name: step.name,
        status: StepStatus.PENDING,
      });
    }

    this.activeStepId = '';
    this.workflowStatus = WorkflowStatus.IDLE;
    this.lastEmittedPercentage = -1;
  }

  /**
   * 从步骤列表初始化
   * @param steps 步骤定义列表
   */
  initializeFromSteps(steps: StepDefinition[]): void {
    this.stepStates.clear();
    this.totalSteps = steps.length;

    for (const step of steps) {
      this.stepStates.set(step.id, {
        stepId: step.id,
        name: step.name,
        status: StepStatus.PENDING,
      });
    }

    this.activeStepId = '';
    this.workflowStatus = WorkflowStatus.IDLE;
    this.lastEmittedPercentage = -1;
  }

  // ============ 步骤状态更新 ============

  /**
   * 更新步骤状态
   * 更新状态后自动发出进度事件和步骤条更新事件
   * @param stepId 步骤 ID
   * @param status 新状态
   */
  updateStepStatus(stepId: string, status: StepStatus): void {
    const state = this.stepStates.get(stepId);
    if (!state) {
      return;
    }

    state.status = status;

    // 更新活动步骤
    if (status === StepStatus.RUNNING || status === StepStatus.WAITING_INPUT) {
      this.activeStepId = stepId;
    }

    // 发出进度更新事件
    this.emitProgressUpdate(stepId);

    // 发出步骤条状态更新事件
    this.emitStepBarUpdate();
  }

  /**
   * 批量更新步骤状态
   * @param updates 状态更新列表
   */
  batchUpdateStepStatus(updates: Array<{ stepId: string; status: StepStatus }>): void {
    for (const { stepId, status } of updates) {
      const state = this.stepStates.get(stepId);
      if (state) {
        state.status = status;

        if (status === StepStatus.RUNNING || status === StepStatus.WAITING_INPUT) {
          this.activeStepId = stepId;
        }
      }
    }

    // 批量更新后只发出一次事件
    if (updates.length > 0) {
      this.emitProgressUpdate(updates[updates.length - 1].stepId);
      this.emitStepBarUpdate();
    }
  }

  // ============ 进度计算 ============

  /**
   * 获取已完成的步骤数
   * 完成状态包括：SUCCESS、FAILED、SKIPPED
   * @returns 已完成步骤数
   */
  getCompletedStepsCount(): number {
    let count = 0;
    for (const state of this.stepStates.values()) {
      if (
        state.status === StepStatus.SUCCESS ||
        state.status === StepStatus.FAILED ||
        state.status === StepStatus.SKIPPED
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * 计算执行进度百分比
   * @returns 进度百分比（0-100）
   */
  calculatePercentage(): number {
    if (this.totalSteps === 0) {
      return 0;
    }
    return Math.round((this.getCompletedStepsCount() / this.totalSteps) * 100);
  }

  /**
   * 获取进度信息
   * @param currentStepId 当前步骤 ID
   * @returns 进度负载
   */
  getProgressPayload(currentStepId: string): ProgressPayload {
    return {
      currentStep: currentStepId,
      totalSteps: this.totalSteps,
      completedSteps: this.getCompletedStepsCount(),
      percentage: this.calculatePercentage(),
    };
  }

  // ============ 进度事件发出 ============

  /**
   * 发出进度更新事件
   * 只在进度百分比实际变化时发出事件，避免重复
   * @param currentStepId 当前步骤 ID
   */
  emitProgressUpdate(currentStepId: string): void {
    const payload = this.getProgressPayload(currentStepId);
    
    // 只在进度变化时发出事件
    if (payload.percentage === this.lastEmittedPercentage) {
      return;
    }
    
    this.lastEmittedPercentage = payload.percentage;
    
    const event = createWorkflowEvent(
      EventType.PROGRESS_UPDATE,
      this.workflowId,
      this.instanceId,
      payload,
      currentStepId
    );
    this.eventEmitter.emit(event);
  }

  // ============ 工作流生命周期事件 ============

  /**
   * 发出工作流开始事件
   */
  emitWorkflowStart(): void {
    this.workflowStatus = WorkflowStatus.RUNNING;
    const event = createWorkflowEvent(
      EventType.WORKFLOW_START,
      this.workflowId,
      this.instanceId,
      {
        totalSteps: this.totalSteps,
        startTime: Date.now(),
      }
    );
    this.eventEmitter.emit(event);
  }

  /**
   * 发出工作流完成事件
   */
  emitWorkflowComplete(): void {
    this.workflowStatus = WorkflowStatus.COMPLETED;
    const event = createWorkflowEvent(
      EventType.WORKFLOW_COMPLETE,
      this.workflowId,
      this.instanceId,
      {
        totalSteps: this.totalSteps,
        completedSteps: this.getCompletedStepsCount(),
        percentage: 100,
        endTime: Date.now(),
      }
    );
    this.eventEmitter.emit(event);
  }

  /**
   * 发出工作流失败事件
   * @param error 错误信息
   * @param failedStepId 失败的步骤 ID（可选）
   */
  emitWorkflowFailed(error: Error, failedStepId?: string): void {
    this.workflowStatus = WorkflowStatus.FAILED;
    const event = createWorkflowEvent(
      EventType.WORKFLOW_FAILED,
      this.workflowId,
      this.instanceId,
      {
        error: error.message,
        errorName: error.name,
        failedStepId,
        totalSteps: this.totalSteps,
        completedSteps: this.getCompletedStepsCount(),
        percentage: this.calculatePercentage(),
        endTime: Date.now(),
      },
      failedStepId
    );
    this.eventEmitter.emit(event);
  }

  // ============ 步骤条状态同步 ============

  /**
   * 获取步骤条状态
   * @returns 步骤条负载
   */
  getStepBarPayload(): StepBarPayload {
    const steps: StepBarItem[] = [];
    for (const state of this.stepStates.values()) {
      steps.push({
        id: state.stepId,
        name: state.name,
        status: state.status,
      });
    }
    return {
      steps,
      activeStepId: this.activeStepId,
    };
  }

  /**
   * 发出步骤条状态更新事件
   */
  emitStepBarUpdate(): void {
    const payload = this.getStepBarPayload();
    const event = createWorkflowEvent(
      EventType.STEP_BAR_UPDATE,
      this.workflowId,
      this.instanceId,
      payload
    );
    this.eventEmitter.emit(event);
  }

  // ============ 状态查询 ============

  /**
   * 获取步骤状态
   * @param stepId 步骤 ID
   * @returns 步骤状态，如果不存在返回 undefined
   */
  getStepStatus(stepId: string): StepStatus | undefined {
    return this.stepStates.get(stepId)?.status;
  }

  /**
   * 获取所有步骤状态
   * @returns 步骤状态映射
   */
  getAllStepStates(): Map<string, StepProgressState> {
    return new Map(this.stepStates);
  }

  /**
   * 获取当前活动步骤 ID
   * @returns 活动步骤 ID
   */
  getActiveStepId(): string {
    return this.activeStepId;
  }

  /**
   * 设置当前活动步骤 ID
   * @param stepId 步骤 ID
   */
  setActiveStepId(stepId: string): void {
    this.activeStepId = stepId;
  }

  /**
   * 获取工作流状态
   * @returns 工作流状态
   */
  getWorkflowStatus(): WorkflowStatus {
    return this.workflowStatus;
  }

  /**
   * 设置工作流状态
   * @param status 工作流状态
   */
  setWorkflowStatus(status: WorkflowStatus): void {
    this.workflowStatus = status;
  }

  /**
   * 获取总步骤数
   * @returns 总步骤数
   */
  getTotalSteps(): number {
    return this.totalSteps;
  }

  /**
   * 获取状态快照
   * 用于查询当前步骤条状态
   * @returns 步骤条状态快照
   */
  getSnapshot(): StepBarPayload {
    return this.getStepBarPayload();
  }

  /**
   * 检查工作流是否完成
   * @returns 是否所有步骤都已完成
   */
  isWorkflowComplete(): boolean {
    for (const state of this.stepStates.values()) {
      if (
        state.status !== StepStatus.SUCCESS &&
        state.status !== StepStatus.FAILED &&
        state.status !== StepStatus.SKIPPED
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * 检查是否有失败的步骤
   * @returns 是否有失败的步骤
   */
  hasFailedSteps(): boolean {
    for (const state of this.stepStates.values()) {
      if (state.status === StepStatus.FAILED) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取失败的步骤 ID 列表
   * @returns 失败的步骤 ID 列表
   */
  getFailedStepIds(): string[] {
    const failedIds: string[] = [];
    for (const state of this.stepStates.values()) {
      if (state.status === StepStatus.FAILED) {
        failedIds.push(state.stepId);
      }
    }
    return failedIds;
  }
}
