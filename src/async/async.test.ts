/**
 * 异步等待机制测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  WaitManager, 
  createWaitingInfo, 
  createTimeoutConfig,
  TimeoutStrategy,
} from './index';
import { EventEmitter, EventType, WorkflowEvent } from '../events';
import { StepStatus, WaitType } from '../core/types';
import { TimeoutError } from '../core/errors';

describe('WaitManager', () => {
  let eventEmitter: EventEmitter;
  let waitManager: WaitManager;
  const workflowId = 'test-workflow';
  const instanceId = 'test-instance';

  beforeEach(() => {
    vi.useFakeTimers();
    eventEmitter = new EventEmitter();
    waitManager = new WaitManager(eventEmitter, workflowId, instanceId);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startWait', () => {
    it('应该将步骤标记为等待状态', async () => {
      const stepId = 'step-1';
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'confirm-dialog'
      );

      // 验证步骤处于等待状态
      expect(waitManager.isWaiting(stepId)).toBe(true);
      
      // 验证步骤状态
      const stepState = waitManager.getStepState(stepId);
      expect(stepState).toBeDefined();
      expect(stepState?.status).toBe(StepStatus.WAITING_INPUT);
      expect(stepState?.waitingFor).toBeDefined();
      expect(stepState?.waitingFor?.type).toBe(WaitType.UI);
      expect(stepState?.waitingFor?.targetId).toBe('confirm-dialog');

      // 恢复等待以完成测试
      waitManager.resumeWait(stepId, { confirmed: true });
      await waitPromise;
    });

    it('应该发出等待开始事件', async () => {
      const stepId = 'step-1';
      const events: WorkflowEvent[] = [];
      
      eventEmitter.on(EventType.WAIT_START, (event) => {
        events.push(event);
      });

      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.TOOL,
        'external-api',
        5000
      );

      expect(events.length).toBe(1);
      expect(events[0].type).toBe(EventType.WAIT_START);
      expect(events[0].stepId).toBe(stepId);
      expect(events[0].payload).toEqual({
        type: WaitType.TOOL,
        targetId: 'external-api',
        timeout: 5000,
      });

      // 恢复等待以完成测试
      waitManager.resumeWait(stepId, {});
      await waitPromise;
    });

    it('应该存储等待信息', async () => {
      const stepId = 'step-1';
      const extraData = { requestId: '123' };
      
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.SIGNAL,
        'approval-signal',
        undefined,
        extraData
      );

      const waitingInfo = waitManager.getWaitingInfo(stepId);
      expect(waitingInfo).toBeDefined();
      expect(waitingInfo?.type).toBe(WaitType.SIGNAL);
      expect(waitingInfo?.targetId).toBe('approval-signal');
      expect(waitingInfo?.data).toEqual(extraData);

      // 恢复等待以完成测试
      waitManager.resumeWait(stepId, {});
      await waitPromise;
    });
  });

  describe('resumeWait', () => {
    it('应该恢复等待并返回结果', async () => {
      const stepId = 'step-1';
      const expectedResult = { data: 'test-result' };
      
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'input-form'
      );

      // 恢复等待
      const resumed = waitManager.resumeWait(stepId, expectedResult);
      expect(resumed).toBe(true);

      // 验证 Promise 返回正确结果
      const result = await waitPromise;
      expect(result).toEqual(expectedResult);

      // 验证步骤不再处于等待状态
      expect(waitManager.isWaiting(stepId)).toBe(false);
    });

    it('应该发出恢复事件', async () => {
      const stepId = 'step-1';
      const events: WorkflowEvent[] = [];
      
      eventEmitter.on(EventType.WAIT_RESUME, (event) => {
        events.push(event);
      });

      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'confirm-dialog'
      );

      waitManager.resumeWait(stepId, { confirmed: true });
      await waitPromise;

      expect(events.length).toBe(1);
      expect(events[0].type).toBe(EventType.WAIT_RESUME);
      expect(events[0].stepId).toBe(stepId);
      expect((events[0].payload as any).result).toEqual({ confirmed: true });
    });

    it('对于不存在的等待应该返回 false', () => {
      const result = waitManager.resumeWait('non-existent', {});
      expect(result).toBe(false);
    });
  });

  describe('cancelWait', () => {
    it('应该取消等待并抛出错误', async () => {
      const stepId = 'step-1';
      
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'confirm-dialog'
      );

      // 取消等待
      const cancelled = waitManager.cancelWait(stepId, '用户取消');
      expect(cancelled).toBe(true);

      // 验证 Promise 被拒绝
      await expect(waitPromise).rejects.toThrow('用户取消');

      // 验证步骤不再处于等待状态
      expect(waitManager.isWaiting(stepId)).toBe(false);
    });

    it('应该发出取消事件', async () => {
      const stepId = 'step-1';
      const events: WorkflowEvent[] = [];
      
      eventEmitter.on(EventType.WAIT_CANCEL, (event) => {
        events.push(event);
      });

      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.TOOL,
        'external-api'
      );

      waitManager.cancelWait(stepId, '操作取消');

      try {
        await waitPromise;
      } catch {
        // 预期会抛出错误
      }

      expect(events.length).toBe(1);
      expect(events[0].type).toBe(EventType.WAIT_CANCEL);
      expect(events[0].stepId).toBe(stepId);
      expect((events[0].payload as any).reason).toBe('操作取消');
    });

    it('对于不存在的等待应该返回 false', () => {
      const result = waitManager.cancelWait('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('超时处理', () => {
    it('应该在超时后触发超时错误', async () => {
      const stepId = 'step-1';
      const timeout = 5000;
      
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'confirm-dialog',
        timeout
      );

      // 快进时间
      vi.advanceTimersByTime(timeout);

      // 验证 Promise 被拒绝并抛出 TimeoutError
      await expect(waitPromise).rejects.toThrow(TimeoutError);
      await expect(waitPromise).rejects.toThrow(`步骤 ${stepId} 等待超时`);

      // 验证步骤不再处于等待状态
      expect(waitManager.isWaiting(stepId)).toBe(false);
    });

    it('应该发出超时事件', async () => {
      const stepId = 'step-1';
      const timeout = 3000;
      const events: WorkflowEvent[] = [];
      
      eventEmitter.on(EventType.WAIT_TIMEOUT, (event) => {
        events.push(event);
      });

      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.TOOL,
        'slow-api',
        timeout
      );

      // 快进时间
      vi.advanceTimersByTime(timeout);

      try {
        await waitPromise;
      } catch {
        // 预期会抛出错误
      }

      expect(events.length).toBe(1);
      expect(events[0].type).toBe(EventType.WAIT_TIMEOUT);
      expect(events[0].stepId).toBe(stepId);
      expect((events[0].payload as any).timeout).toBe(timeout);
    });

    it('在超时前恢复应该清除超时定时器', async () => {
      const stepId = 'step-1';
      const timeout = 5000;
      
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'confirm-dialog',
        timeout
      );

      // 在超时前恢复
      vi.advanceTimersByTime(2000);
      waitManager.resumeWait(stepId, { confirmed: true });

      const result = await waitPromise;
      expect(result).toEqual({ confirmed: true });

      // 继续快进时间，确保不会触发超时
      vi.advanceTimersByTime(5000);
      
      // 步骤应该已经完成，不在等待中
      expect(waitManager.isWaiting(stepId)).toBe(false);
    });
  });

  describe('getWaitingStepIds', () => {
    it('应该返回所有等待中的步骤 ID', async () => {
      const waitPromise1 = waitManager.startWait('step-1', WaitType.UI, 'dialog-1');
      const waitPromise2 = waitManager.startWait('step-2', WaitType.TOOL, 'api-1');
      const waitPromise3 = waitManager.startWait('step-3', WaitType.SIGNAL, 'signal-1');

      const waitingIds = waitManager.getWaitingStepIds();
      expect(waitingIds).toHaveLength(3);
      expect(waitingIds).toContain('step-1');
      expect(waitingIds).toContain('step-2');
      expect(waitingIds).toContain('step-3');

      // 清理
      waitManager.resumeWait('step-1', {});
      waitManager.resumeWait('step-2', {});
      waitManager.resumeWait('step-3', {});
      await Promise.all([waitPromise1, waitPromise2, waitPromise3]);
    });
  });

  describe('getWaitingCount', () => {
    it('应该返回正确的等待数量', async () => {
      expect(waitManager.getWaitingCount()).toBe(0);

      const waitPromise1 = waitManager.startWait('step-1', WaitType.UI, 'dialog-1');
      expect(waitManager.getWaitingCount()).toBe(1);

      const waitPromise2 = waitManager.startWait('step-2', WaitType.TOOL, 'api-1');
      expect(waitManager.getWaitingCount()).toBe(2);

      waitManager.resumeWait('step-1', {});
      await waitPromise1;
      expect(waitManager.getWaitingCount()).toBe(1);

      waitManager.resumeWait('step-2', {});
      await waitPromise2;
      expect(waitManager.getWaitingCount()).toBe(0);
    });
  });

  describe('cancelAllWaits', () => {
    it('应该取消所有等待', async () => {
      const waitPromise1 = waitManager.startWait('step-1', WaitType.UI, 'dialog-1');
      const waitPromise2 = waitManager.startWait('step-2', WaitType.TOOL, 'api-1');
      const waitPromise3 = waitManager.startWait('step-3', WaitType.SIGNAL, 'signal-1');

      expect(waitManager.getWaitingCount()).toBe(3);

      // 取消所有等待
      waitManager.cancelAllWaits('工作流已取消');

      // 验证所有 Promise 都被拒绝
      await expect(waitPromise1).rejects.toThrow('工作流已取消');
      await expect(waitPromise2).rejects.toThrow('工作流已取消');
      await expect(waitPromise3).rejects.toThrow('工作流已取消');

      // 验证没有等待中的步骤
      expect(waitManager.getWaitingCount()).toBe(0);
    });
  });

  describe('非阻塞特性', () => {
    it('等待不应该阻塞其他操作', async () => {
      // 启动多个等待
      const waitPromise1 = waitManager.startWait('step-1', WaitType.UI, 'dialog-1', 10000);
      const waitPromise2 = waitManager.startWait('step-2', WaitType.TOOL, 'api-1', 10000);

      // 验证两个等待都在进行中
      expect(waitManager.isWaiting('step-1')).toBe(true);
      expect(waitManager.isWaiting('step-2')).toBe(true);

      // 可以独立恢复其中一个
      waitManager.resumeWait('step-1', { result: 'first' });
      const result1 = await waitPromise1;
      expect(result1).toEqual({ result: 'first' });

      // 另一个仍在等待
      expect(waitManager.isWaiting('step-1')).toBe(false);
      expect(waitManager.isWaiting('step-2')).toBe(true);

      // 恢复第二个
      waitManager.resumeWait('step-2', { result: 'second' });
      const result2 = await waitPromise2;
      expect(result2).toEqual({ result: 'second' });
    });
  });
});

describe('createWaitingInfo', () => {
  it('应该创建正确的等待信息', () => {
    const info = createWaitingInfo(
      WaitType.UI,
      'confirm-dialog',
      5000,
      { extra: 'data' }
    );

    expect(info.type).toBe(WaitType.UI);
    expect(info.targetId).toBe('confirm-dialog');
    expect(info.timeout).toBe(5000);
    expect(info.data).toEqual({ extra: 'data' });
    expect(info.startTime).toBeDefined();
    expect(typeof info.startTime).toBe('number');
  });

  it('应该支持无超时的等待信息', () => {
    const info = createWaitingInfo(WaitType.SIGNAL, 'approval');

    expect(info.type).toBe(WaitType.SIGNAL);
    expect(info.targetId).toBe('approval');
    expect(info.timeout).toBeUndefined();
    expect(info.data).toBeUndefined();
  });
});

describe('超时策略', () => {
  let eventEmitter: EventEmitter;
  let waitManager: WaitManager;
  const workflowId = 'test-workflow';
  const instanceId = 'test-instance';

  beforeEach(() => {
    vi.useFakeTimers();
    eventEmitter = new EventEmitter();
    waitManager = new WaitManager(eventEmitter, workflowId, instanceId);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TimeoutStrategy.ERROR', () => {
    it('应该在超时后抛出 TimeoutError', async () => {
      const stepId = 'step-1';
      const timeout = 5000;
      
      const waitPromise = waitManager.startWaitWithConfig(
        stepId,
        WaitType.UI,
        'confirm-dialog',
        createTimeoutConfig(timeout, TimeoutStrategy.ERROR)
      );

      vi.advanceTimersByTime(timeout);

      await expect(waitPromise).rejects.toThrow(TimeoutError);
    });
  });

  describe('TimeoutStrategy.DEFAULT', () => {
    it('应该在超时后返回默认值', async () => {
      const stepId = 'step-1';
      const timeout = 5000;
      const defaultValue = { fallback: true };
      
      const waitPromise = waitManager.startWaitWithConfig(
        stepId,
        WaitType.UI,
        'confirm-dialog',
        createTimeoutConfig(timeout, TimeoutStrategy.DEFAULT, defaultValue)
      );

      vi.advanceTimersByTime(timeout);

      const result = await waitPromise;
      expect(result).toEqual(defaultValue);
    });

    it('应该支持 undefined 作为默认值', async () => {
      const stepId = 'step-1';
      const timeout = 3000;
      
      const waitPromise = waitManager.startWaitWithConfig(
        stepId,
        WaitType.TOOL,
        'api-call',
        createTimeoutConfig(timeout, TimeoutStrategy.DEFAULT, undefined)
      );

      vi.advanceTimersByTime(timeout);

      const result = await waitPromise;
      expect(result).toBeUndefined();
    });
  });

  describe('TimeoutStrategy.IGNORE', () => {
    it('应该在超时后继续等待', async () => {
      const stepId = 'step-1';
      const timeout = 3000;
      const events: WorkflowEvent[] = [];
      
      eventEmitter.on(EventType.WAIT_TIMEOUT, (event) => {
        events.push(event);
      });

      const waitPromise = waitManager.startWaitWithConfig(
        stepId,
        WaitType.UI,
        'confirm-dialog',
        createTimeoutConfig(timeout, TimeoutStrategy.IGNORE)
      );

      // 第一次超时
      vi.advanceTimersByTime(timeout);
      expect(events.length).toBe(1);
      expect(waitManager.isWaiting(stepId)).toBe(true);

      // 第二次超时
      vi.advanceTimersByTime(timeout);
      expect(events.length).toBe(2);
      expect(waitManager.isWaiting(stepId)).toBe(true);

      // 最终恢复
      waitManager.resumeWait(stepId, { confirmed: true });
      const result = await waitPromise;
      expect(result).toEqual({ confirmed: true });
    });
  });
});

describe('getRemainingTime', () => {
  let eventEmitter: EventEmitter;
  let waitManager: WaitManager;

  beforeEach(() => {
    vi.useFakeTimers();
    eventEmitter = new EventEmitter();
    waitManager = new WaitManager(eventEmitter, 'test-workflow', 'test-instance');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该返回正确的剩余时间', async () => {
    const stepId = 'step-1';
    const timeout = 10000;
    
    const waitPromise = waitManager.startWait(
      stepId,
      WaitType.UI,
      'dialog',
      timeout
    );

    // 初始剩余时间应该接近超时时间
    expect(waitManager.getRemainingTime(stepId)).toBe(timeout);

    // 经过一段时间后
    vi.advanceTimersByTime(3000);
    expect(waitManager.getRemainingTime(stepId)).toBe(7000);

    // 恢复等待
    waitManager.resumeWait(stepId, {});
    await waitPromise;
  });

  it('对于无超时的等待应该返回 undefined', async () => {
    const stepId = 'step-1';
    
    const waitPromise = waitManager.startWait(
      stepId,
      WaitType.UI,
      'dialog'
    );

    expect(waitManager.getRemainingTime(stepId)).toBeUndefined();

    waitManager.resumeWait(stepId, {});
    await waitPromise;
  });

  it('对于不存在的等待应该返回 undefined', () => {
    expect(waitManager.getRemainingTime('non-existent')).toBeUndefined();
  });
});

describe('extendTimeout', () => {
  let eventEmitter: EventEmitter;
  let waitManager: WaitManager;

  beforeEach(() => {
    vi.useFakeTimers();
    eventEmitter = new EventEmitter();
    waitManager = new WaitManager(eventEmitter, 'test-workflow', 'test-instance');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该成功延长超时时间', async () => {
    const stepId = 'step-1';
    const initialTimeout = 5000;
    const extension = 3000;
    
    const waitPromise = waitManager.startWait(
      stepId,
      WaitType.UI,
      'dialog',
      initialTimeout
    );

    // 经过 4 秒
    vi.advanceTimersByTime(4000);
    expect(waitManager.isWaiting(stepId)).toBe(true);

    // 延长 3 秒
    const extended = waitManager.extendTimeout(stepId, extension);
    expect(extended).toBe(true);

    // 再经过 2 秒（原本应该超时，但延长后不会）
    vi.advanceTimersByTime(2000);
    expect(waitManager.isWaiting(stepId)).toBe(true);

    // 恢复等待
    waitManager.resumeWait(stepId, { result: 'success' });
    const result = await waitPromise;
    expect(result).toEqual({ result: 'success' });
  });

  it('对于无超时的等待应该返回 false', async () => {
    const stepId = 'step-1';
    
    const waitPromise = waitManager.startWait(
      stepId,
      WaitType.UI,
      'dialog'
    );

    const extended = waitManager.extendTimeout(stepId, 5000);
    expect(extended).toBe(false);

    waitManager.resumeWait(stepId, {});
    await waitPromise;
  });

  it('对于不存在的等待应该返回 false', () => {
    const extended = waitManager.extendTimeout('non-existent', 5000);
    expect(extended).toBe(false);
  });
});

describe('createTimeoutConfig', () => {
  it('应该创建正确的超时配置', () => {
    const config = createTimeoutConfig(5000, TimeoutStrategy.DEFAULT, { fallback: true });

    expect(config.timeout).toBe(5000);
    expect(config.strategy).toBe(TimeoutStrategy.DEFAULT);
    expect(config.defaultValue).toEqual({ fallback: true });
  });

  it('应该使用默认策略 ERROR', () => {
    const config = createTimeoutConfig(3000);

    expect(config.timeout).toBe(3000);
    expect(config.strategy).toBe(TimeoutStrategy.ERROR);
    expect(config.defaultValue).toBeUndefined();
  });
});

describe('等待恢复和取消', () => {
  let eventEmitter: EventEmitter;
  let waitManager: WaitManager;

  beforeEach(() => {
    vi.useFakeTimers();
    eventEmitter = new EventEmitter();
    waitManager = new WaitManager(eventEmitter, 'test-workflow', 'test-instance');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('恢复步骤执行', () => {
    it('应该能够恢复等待中的步骤并传递结果', async () => {
      const stepId = 'step-1';
      const expectedResult = { 
        userInput: 'test-input',
        timestamp: Date.now(),
      };
      
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'input-form'
      );

      // 验证步骤在等待中
      expect(waitManager.isWaiting(stepId)).toBe(true);
      expect(waitManager.getStepState(stepId)?.status).toBe(StepStatus.WAITING_INPUT);

      // 恢复等待
      const resumed = waitManager.resumeWait(stepId, expectedResult);
      expect(resumed).toBe(true);

      // 验证结果
      const result = await waitPromise;
      expect(result).toEqual(expectedResult);

      // 验证步骤不再等待
      expect(waitManager.isWaiting(stepId)).toBe(false);
    });

    it('恢复后应该清除等待信息', async () => {
      const stepId = 'step-1';
      
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.TOOL,
        'external-api',
        10000
      );

      // 验证等待信息存在
      expect(waitManager.getWaitingInfo(stepId)).toBeDefined();

      // 恢复等待
      waitManager.resumeWait(stepId, { data: 'response' });
      await waitPromise;

      // 验证等待信息已清除
      expect(waitManager.getWaitingInfo(stepId)).toBeUndefined();
      expect(waitManager.getStepState(stepId)?.waitingFor).toBeUndefined();
    });

    it('恢复后应该清除超时定时器', async () => {
      const stepId = 'step-1';
      const timeout = 10000;
      const events: WorkflowEvent[] = [];
      
      eventEmitter.on(EventType.WAIT_TIMEOUT, (event) => {
        events.push(event);
      });

      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'dialog',
        timeout
      );

      // 在超时前恢复
      vi.advanceTimersByTime(5000);
      waitManager.resumeWait(stepId, {});
      await waitPromise;

      // 继续推进时间，确保不会触发超时
      vi.advanceTimersByTime(10000);
      expect(events.length).toBe(0);
    });
  });

  describe('取消等待步骤', () => {
    it('应该能够取消等待中的步骤', async () => {
      const stepId = 'step-1';
      const cancelReason = '用户取消操作';
      
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'confirm-dialog'
      );

      // 验证步骤在等待中
      expect(waitManager.isWaiting(stepId)).toBe(true);

      // 取消等待
      const cancelled = waitManager.cancelWait(stepId, cancelReason);
      expect(cancelled).toBe(true);

      // 验证 Promise 被拒绝
      await expect(waitPromise).rejects.toThrow(cancelReason);

      // 验证步骤不再等待
      expect(waitManager.isWaiting(stepId)).toBe(false);
    });

    it('取消后应该清除超时定时器', async () => {
      const stepId = 'step-1';
      const timeout = 10000;
      const events: WorkflowEvent[] = [];
      
      eventEmitter.on(EventType.WAIT_TIMEOUT, (event) => {
        events.push(event);
      });

      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.TOOL,
        'slow-api',
        timeout
      );

      // 取消等待
      waitManager.cancelWait(stepId, '操作取消');

      try {
        await waitPromise;
      } catch {
        // 预期会抛出错误
      }

      // 继续推进时间，确保不会触发超时
      vi.advanceTimersByTime(timeout + 5000);
      expect(events.length).toBe(0);
    });

    it('应该使用默认取消原因', async () => {
      const stepId = 'step-1';
      
      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'dialog'
      );

      // 使用默认原因取消
      waitManager.cancelWait(stepId);

      await expect(waitPromise).rejects.toThrow('等待已取消');
    });

    it('取消所有等待应该清理所有等待状态', async () => {
      // 启动多个等待
      const waitPromise1 = waitManager.startWait('step-1', WaitType.UI, 'dialog-1');
      const waitPromise2 = waitManager.startWait('step-2', WaitType.TOOL, 'api-1');
      const waitPromise3 = waitManager.startWait('step-3', WaitType.SIGNAL, 'signal-1');

      expect(waitManager.getWaitingCount()).toBe(3);

      // 取消所有等待
      waitManager.cancelAllWaits('批量取消');

      // 验证所有 Promise 都被拒绝
      await expect(waitPromise1).rejects.toThrow('批量取消');
      await expect(waitPromise2).rejects.toThrow('批量取消');
      await expect(waitPromise3).rejects.toThrow('批量取消');

      // 验证所有等待都已清除
      expect(waitManager.getWaitingCount()).toBe(0);
      expect(waitManager.isWaiting('step-1')).toBe(false);
      expect(waitManager.isWaiting('step-2')).toBe(false);
      expect(waitManager.isWaiting('step-3')).toBe(false);
    });
  });

  describe('事件发出', () => {
    it('恢复时应该发出 WAIT_RESUME 事件', async () => {
      const stepId = 'step-1';
      const events: WorkflowEvent[] = [];
      
      eventEmitter.on(EventType.WAIT_RESUME, (event) => {
        events.push(event);
      });

      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.UI,
        'input-form'
      );

      vi.advanceTimersByTime(2000);
      waitManager.resumeWait(stepId, { input: 'test' });
      await waitPromise;

      expect(events.length).toBe(1);
      expect(events[0].type).toBe(EventType.WAIT_RESUME);
      expect(events[0].stepId).toBe(stepId);
      expect((events[0].payload as any).result).toEqual({ input: 'test' });
      expect((events[0].payload as any).elapsedTime).toBeGreaterThanOrEqual(2000);
    });

    it('取消时应该发出 WAIT_CANCEL 事件', async () => {
      const stepId = 'step-1';
      const events: WorkflowEvent[] = [];
      
      eventEmitter.on(EventType.WAIT_CANCEL, (event) => {
        events.push(event);
      });

      const waitPromise = waitManager.startWait(
        stepId,
        WaitType.TOOL,
        'external-api'
      );

      vi.advanceTimersByTime(1000);
      waitManager.cancelWait(stepId, '用户取消');

      try {
        await waitPromise;
      } catch {
        // 预期会抛出错误
      }

      expect(events.length).toBe(1);
      expect(events[0].type).toBe(EventType.WAIT_CANCEL);
      expect(events[0].stepId).toBe(stepId);
      expect((events[0].payload as any).reason).toBe('用户取消');
      expect((events[0].payload as any).elapsedTime).toBeGreaterThanOrEqual(1000);
    });
  });
});
