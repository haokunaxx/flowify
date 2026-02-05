/**
 * EventEmitter 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EventEmitter,
  EventType,
  WorkflowEvent,
  createWorkflowEvent,
} from './index';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe('on', () => {
    it('应该注册事件监听器', () => {
      const listener = vi.fn();
      emitter.on(EventType.WORKFLOW_START, listener);
      expect(emitter.listenerCount(EventType.WORKFLOW_START)).toBe(1);
    });

    it('应该支持同一事件类型注册多个监听器', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      emitter.on(EventType.WORKFLOW_START, listener1);
      emitter.on(EventType.WORKFLOW_START, listener2);
      expect(emitter.listenerCount(EventType.WORKFLOW_START)).toBe(2);
    });

    it('应该支持不同事件类型注册监听器', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      emitter.on(EventType.WORKFLOW_START, listener1);
      emitter.on(EventType.WORKFLOW_COMPLETE, listener2);
      expect(emitter.listenerCount(EventType.WORKFLOW_START)).toBe(1);
      expect(emitter.listenerCount(EventType.WORKFLOW_COMPLETE)).toBe(1);
    });
  });

  describe('off', () => {
    it('应该移除已注册的监听器', () => {
      const listener = vi.fn();
      emitter.on(EventType.WORKFLOW_START, listener);
      const result = emitter.off(EventType.WORKFLOW_START, listener);
      expect(result).toBe(true);
      expect(emitter.listenerCount(EventType.WORKFLOW_START)).toBe(0);
    });

    it('移除未注册的监听器应返回 false', () => {
      const listener = vi.fn();
      const result = emitter.off(EventType.WORKFLOW_START, listener);
      expect(result).toBe(false);
    });

    it('移除不存在的事件类型的监听器应返回 false', () => {
      const listener = vi.fn();
      emitter.on(EventType.WORKFLOW_START, listener);
      const result = emitter.off(EventType.WORKFLOW_COMPLETE, listener);
      expect(result).toBe(false);
    });
  });

  describe('emit', () => {
    it('应该触发所有注册的监听器', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      emitter.on(EventType.WORKFLOW_START, listener1);
      emitter.on(EventType.WORKFLOW_START, listener2);

      const event = createWorkflowEvent(
        EventType.WORKFLOW_START,
        'workflow-1',
        'instance-1',
        { message: 'started' }
      );
      emitter.emit(event);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
    });

    it('不应触发其他事件类型的监听器', () => {
      const startListener = vi.fn();
      const completeListener = vi.fn();
      emitter.on(EventType.WORKFLOW_START, startListener);
      emitter.on(EventType.WORKFLOW_COMPLETE, completeListener);

      const event = createWorkflowEvent(
        EventType.WORKFLOW_START,
        'workflow-1',
        'instance-1',
        {}
      );
      emitter.emit(event);

      expect(startListener).toHaveBeenCalledTimes(1);
      expect(completeListener).not.toHaveBeenCalled();
    });

    it('没有监听器时 emit 不应报错', () => {
      const event = createWorkflowEvent(
        EventType.WORKFLOW_START,
        'workflow-1',
        'instance-1',
        {}
      );
      expect(() => emitter.emit(event)).not.toThrow();
    });
  });

  describe('listenerCount', () => {
    it('没有监听器时应返回 0', () => {
      expect(emitter.listenerCount(EventType.WORKFLOW_START)).toBe(0);
    });

    it('应返回正确的监听器数量', () => {
      emitter.on(EventType.WORKFLOW_START, vi.fn());
      emitter.on(EventType.WORKFLOW_START, vi.fn());
      expect(emitter.listenerCount(EventType.WORKFLOW_START)).toBe(2);
    });
  });

  describe('removeAllListeners', () => {
    it('应移除指定事件类型的所有监听器', () => {
      emitter.on(EventType.WORKFLOW_START, vi.fn());
      emitter.on(EventType.WORKFLOW_START, vi.fn());
      emitter.on(EventType.WORKFLOW_COMPLETE, vi.fn());

      emitter.removeAllListeners(EventType.WORKFLOW_START);

      expect(emitter.listenerCount(EventType.WORKFLOW_START)).toBe(0);
      expect(emitter.listenerCount(EventType.WORKFLOW_COMPLETE)).toBe(1);
    });

    it('不传参数时应移除所有监听器', () => {
      emitter.on(EventType.WORKFLOW_START, vi.fn());
      emitter.on(EventType.WORKFLOW_COMPLETE, vi.fn());

      emitter.removeAllListeners();

      expect(emitter.listenerCount(EventType.WORKFLOW_START)).toBe(0);
      expect(emitter.listenerCount(EventType.WORKFLOW_COMPLETE)).toBe(0);
    });
  });

  describe('hasListeners', () => {
    it('没有监听器时应返回 false', () => {
      expect(emitter.hasListeners(EventType.WORKFLOW_START)).toBe(false);
    });

    it('有监听器时应返回 true', () => {
      emitter.on(EventType.WORKFLOW_START, vi.fn());
      expect(emitter.hasListeners(EventType.WORKFLOW_START)).toBe(true);
    });
  });
});

describe('WorkflowEvent', () => {
  describe('createWorkflowEvent', () => {
    it('应创建包含所有必要字段的事件', () => {
      const event = createWorkflowEvent(
        EventType.STEP_START,
        'workflow-1',
        'instance-1',
        { data: 'test' },
        'step-1'
      );

      expect(event.type).toBe(EventType.STEP_START);
      expect(event.workflowId).toBe('workflow-1');
      expect(event.instanceId).toBe('instance-1');
      expect(event.stepId).toBe('step-1');
      expect(event.payload).toEqual({ data: 'test' });
      expect(typeof event.timestamp).toBe('number');
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('stepId 应该是可选的', () => {
      const event = createWorkflowEvent(
        EventType.WORKFLOW_START,
        'workflow-1',
        'instance-1',
        {}
      );

      expect(event.stepId).toBeUndefined();
    });
  });
});

describe('EventType', () => {
  it('应包含所有工作流级别事件', () => {
    expect(EventType.WORKFLOW_START).toBe('workflow:start');
    expect(EventType.WORKFLOW_COMPLETE).toBe('workflow:complete');
    expect(EventType.WORKFLOW_FAILED).toBe('workflow:failed');
  });

  it('应包含所有步骤级别事件', () => {
    expect(EventType.STEP_START).toBe('step:start');
    expect(EventType.STEP_COMPLETE).toBe('step:complete');
    expect(EventType.STEP_FAILED).toBe('step:failed');
    expect(EventType.STEP_RETRY).toBe('step:retry');
    expect(EventType.STEP_SKIP).toBe('step:skip');
  });

  it('应包含所有进度事件', () => {
    expect(EventType.PROGRESS_UPDATE).toBe('progress:update');
    expect(EventType.STEP_BAR_UPDATE).toBe('stepbar:update');
  });

  it('应包含所有 UI 事件', () => {
    expect(EventType.UI_RENDER).toBe('ui:render');
    expect(EventType.UI_RESPONSE).toBe('ui:response');
  });

  it('应包含所有工具事件', () => {
    expect(EventType.TOOL_INVOKE).toBe('tool:invoke');
    expect(EventType.TOOL_COMPLETE).toBe('tool:complete');
    expect(EventType.TOOL_FAILED).toBe('tool:failed');
  });

  it('应包含所有等待事件', () => {
    expect(EventType.WAIT_START).toBe('wait:start');
    expect(EventType.WAIT_TIMEOUT).toBe('wait:timeout');
    expect(EventType.WAIT_RESUME).toBe('wait:resume');
    expect(EventType.WAIT_CANCEL).toBe('wait:cancel');
  });
});
