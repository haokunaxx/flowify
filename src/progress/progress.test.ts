/**
 * 进度管理模块测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProgressManager } from './index';
import { EventEmitter, EventType } from '../events';
import { StepStatus, WorkflowStatus } from '../core/types';
import type { WorkflowDefinition, StepDefinition } from '../core/types';

describe('ProgressManager', () => {
  let eventEmitter: EventEmitter;
  let progressManager: ProgressManager;
  const workflowId = 'test-workflow';
  const instanceId = 'test-instance';

  // 测试用工作流定义
  const testWorkflow: WorkflowDefinition = {
    id: workflowId,
    name: '测试工作流',
    steps: [
      { id: 'step1', name: '步骤1', type: 'task' },
      { id: 'step2', name: '步骤2', type: 'task', dependencies: ['step1'] },
      { id: 'step3', name: '步骤3', type: 'task', dependencies: ['step2'] },
    ],
  };

  beforeEach(() => {
    eventEmitter = new EventEmitter();
    progressManager = new ProgressManager(eventEmitter, workflowId, instanceId);
    progressManager.initialize(testWorkflow);
  });

  describe('初始化', () => {
    it('应该正确初始化步骤状态', () => {
      expect(progressManager.getTotalSteps()).toBe(3);
      expect(progressManager.getStepStatus('step1')).toBe(StepStatus.PENDING);
      expect(progressManager.getStepStatus('step2')).toBe(StepStatus.PENDING);
      expect(progressManager.getStepStatus('step3')).toBe(StepStatus.PENDING);
    });

    it('应该从步骤列表初始化', () => {
      const steps: StepDefinition[] = [
        { id: 'a', name: 'A', type: 'task' },
        { id: 'b', name: 'B', type: 'task' },
      ];
      progressManager.initializeFromSteps(steps);
      expect(progressManager.getTotalSteps()).toBe(2);
      expect(progressManager.getStepStatus('a')).toBe(StepStatus.PENDING);
    });
  });

  describe('步骤状态更新', () => {
    it('应该正确更新步骤状态', () => {
      progressManager.updateStepStatus('step1', StepStatus.RUNNING);
      expect(progressManager.getStepStatus('step1')).toBe(StepStatus.RUNNING);
    });

    it('更新为 RUNNING 状态时应该设置活动步骤', () => {
      progressManager.updateStepStatus('step1', StepStatus.RUNNING);
      expect(progressManager.getActiveStepId()).toBe('step1');
    });

    it('更新为 WAITING_INPUT 状态时应该设置活动步骤', () => {
      progressManager.updateStepStatus('step2', StepStatus.WAITING_INPUT);
      expect(progressManager.getActiveStepId()).toBe('step2');
    });

    it('应该发出进度更新事件', () => {
      const listener = vi.fn();
      eventEmitter.on(EventType.PROGRESS_UPDATE, listener);

      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe(EventType.PROGRESS_UPDATE);
      expect(event.payload.completedSteps).toBe(1);
    });

    it('应该发出步骤条更新事件', () => {
      const listener = vi.fn();
      eventEmitter.on(EventType.STEP_BAR_UPDATE, listener);

      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe(EventType.STEP_BAR_UPDATE);
    });

    it('批量更新应该只发出一次事件', () => {
      const progressListener = vi.fn();
      const stepBarListener = vi.fn();
      eventEmitter.on(EventType.PROGRESS_UPDATE, progressListener);
      eventEmitter.on(EventType.STEP_BAR_UPDATE, stepBarListener);

      progressManager.batchUpdateStepStatus([
        { stepId: 'step1', status: StepStatus.SUCCESS },
        { stepId: 'step2', status: StepStatus.RUNNING },
      ]);

      expect(progressListener).toHaveBeenCalledTimes(1);
      expect(stepBarListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('进度计算', () => {
    it('初始状态下已完成步骤数应为 0', () => {
      expect(progressManager.getCompletedStepsCount()).toBe(0);
    });

    it('SUCCESS 状态应计入已完成', () => {
      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);
      expect(progressManager.getCompletedStepsCount()).toBe(1);
    });

    it('FAILED 状态应计入已完成', () => {
      progressManager.updateStepStatus('step1', StepStatus.FAILED);
      expect(progressManager.getCompletedStepsCount()).toBe(1);
    });

    it('SKIPPED 状态应计入已完成', () => {
      progressManager.updateStepStatus('step1', StepStatus.SKIPPED);
      expect(progressManager.getCompletedStepsCount()).toBe(1);
    });

    it('RUNNING 状态不应计入已完成', () => {
      progressManager.updateStepStatus('step1', StepStatus.RUNNING);
      expect(progressManager.getCompletedStepsCount()).toBe(0);
    });

    it('应该正确计算进度百分比', () => {
      expect(progressManager.calculatePercentage()).toBe(0);

      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);
      expect(progressManager.calculatePercentage()).toBe(33); // 1/3 ≈ 33%

      progressManager.updateStepStatus('step2', StepStatus.SUCCESS);
      expect(progressManager.calculatePercentage()).toBe(67); // 2/3 ≈ 67%

      progressManager.updateStepStatus('step3', StepStatus.SUCCESS);
      expect(progressManager.calculatePercentage()).toBe(100);
    });

    it('空工作流的进度百分比应为 0', () => {
      progressManager.initializeFromSteps([]);
      expect(progressManager.calculatePercentage()).toBe(0);
    });
  });

  describe('进度事件', () => {
    it('进度事件应包含正确的负载', () => {
      const listener = vi.fn();
      eventEmitter.on(EventType.PROGRESS_UPDATE, listener);

      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);

      const event = listener.mock.calls[0][0];
      expect(event.payload).toEqual({
        currentStep: 'step1',
        totalSteps: 3,
        completedSteps: 1,
        percentage: 33,
      });
    });
  });

  describe('工作流生命周期事件', () => {
    it('应该发出工作流开始事件', () => {
      const listener = vi.fn();
      eventEmitter.on(EventType.WORKFLOW_START, listener);

      progressManager.emitWorkflowStart();

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe(EventType.WORKFLOW_START);
      expect(event.payload.totalSteps).toBe(3);
      expect(event.payload.startTime).toBeDefined();
    });

    it('工作流开始后状态应为 RUNNING', () => {
      progressManager.emitWorkflowStart();
      expect(progressManager.getWorkflowStatus()).toBe(WorkflowStatus.RUNNING);
    });

    it('应该发出工作流完成事件', () => {
      const listener = vi.fn();
      eventEmitter.on(EventType.WORKFLOW_COMPLETE, listener);

      // 先完成所有步骤
      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);
      progressManager.updateStepStatus('step2', StepStatus.SUCCESS);
      progressManager.updateStepStatus('step3', StepStatus.SUCCESS);

      progressManager.emitWorkflowComplete();

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe(EventType.WORKFLOW_COMPLETE);
      expect(event.payload.percentage).toBe(100);
      expect(event.payload.endTime).toBeDefined();
    });

    it('工作流完成后状态应为 COMPLETED', () => {
      progressManager.emitWorkflowComplete();
      expect(progressManager.getWorkflowStatus()).toBe(WorkflowStatus.COMPLETED);
    });

    it('应该发出工作流失败事件', () => {
      const listener = vi.fn();
      eventEmitter.on(EventType.WORKFLOW_FAILED, listener);

      const error = new Error('测试错误');
      progressManager.emitWorkflowFailed(error, 'step2');

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe(EventType.WORKFLOW_FAILED);
      expect(event.payload.error).toBe('测试错误');
      expect(event.payload.failedStepId).toBe('step2');
      expect(event.payload.endTime).toBeDefined();
    });

    it('工作流失败后状态应为 FAILED', () => {
      progressManager.emitWorkflowFailed(new Error('测试'));
      expect(progressManager.getWorkflowStatus()).toBe(WorkflowStatus.FAILED);
    });
  });

  describe('步骤条状态同步', () => {
    it('应该返回正确的步骤条状态', () => {
      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);
      progressManager.updateStepStatus('step2', StepStatus.RUNNING);

      const payload = progressManager.getStepBarPayload();

      expect(payload.steps).toHaveLength(3);
      expect(payload.activeStepId).toBe('step2');

      const step1 = payload.steps.find(s => s.id === 'step1');
      const step2 = payload.steps.find(s => s.id === 'step2');
      expect(step1?.status).toBe(StepStatus.SUCCESS);
      expect(step2?.status).toBe(StepStatus.RUNNING);
    });

    it('步骤条更新事件应包含所有步骤状态', () => {
      const listener = vi.fn();
      eventEmitter.on(EventType.STEP_BAR_UPDATE, listener);

      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);

      const event = listener.mock.calls[0][0];
      expect(event.payload.steps).toHaveLength(3);
      expect(event.payload.steps.map((s: { id: string }) => s.id)).toContain('step1');
      expect(event.payload.steps.map((s: { id: string }) => s.id)).toContain('step2');
      expect(event.payload.steps.map((s: { id: string }) => s.id)).toContain('step3');
    });

    it('getSnapshot 应返回当前状态快照', () => {
      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);
      progressManager.updateStepStatus('step2', StepStatus.RUNNING);

      const snapshot = progressManager.getSnapshot();

      expect(snapshot.steps).toHaveLength(3);
      expect(snapshot.activeStepId).toBe('step2');
    });
  });

  describe('状态查询', () => {
    it('应该返回所有步骤状态', () => {
      const states = progressManager.getAllStepStates();
      expect(states.size).toBe(3);
    });

    it('查询不存在的步骤应返回 undefined', () => {
      expect(progressManager.getStepStatus('nonexistent')).toBeUndefined();
    });

    it('isWorkflowComplete 应正确判断工作流是否完成', () => {
      expect(progressManager.isWorkflowComplete()).toBe(false);

      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);
      progressManager.updateStepStatus('step2', StepStatus.SKIPPED);
      expect(progressManager.isWorkflowComplete()).toBe(false);

      progressManager.updateStepStatus('step3', StepStatus.FAILED);
      expect(progressManager.isWorkflowComplete()).toBe(true);
    });

    it('hasFailedSteps 应正确判断是否有失败步骤', () => {
      expect(progressManager.hasFailedSteps()).toBe(false);

      progressManager.updateStepStatus('step1', StepStatus.SUCCESS);
      expect(progressManager.hasFailedSteps()).toBe(false);

      progressManager.updateStepStatus('step2', StepStatus.FAILED);
      expect(progressManager.hasFailedSteps()).toBe(true);
    });

    it('getFailedStepIds 应返回所有失败步骤的 ID', () => {
      progressManager.updateStepStatus('step1', StepStatus.FAILED);
      progressManager.updateStepStatus('step2', StepStatus.SUCCESS);
      progressManager.updateStepStatus('step3', StepStatus.FAILED);

      const failedIds = progressManager.getFailedStepIds();
      expect(failedIds).toHaveLength(2);
      expect(failedIds).toContain('step1');
      expect(failedIds).toContain('step3');
    });
  });

  describe('手动设置', () => {
    it('应该能手动设置活动步骤 ID', () => {
      progressManager.setActiveStepId('step2');
      expect(progressManager.getActiveStepId()).toBe('step2');
    });

    it('应该能手动设置工作流状态', () => {
      progressManager.setWorkflowStatus(WorkflowStatus.PAUSED);
      expect(progressManager.getWorkflowStatus()).toBe(WorkflowStatus.PAUSED);
    });
  });
});
