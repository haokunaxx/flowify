/**
 * UI 交互系统测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIInteractionHandler } from './index';
import { UIRegistry } from '../registry';
import { EventEmitter, EventType } from '../events';
import { UIMode, Context, UIConfig, UIRenderResult } from '../core/types';

// 创建模拟上下文
function createMockContext(): Context {
  const stepOutputs: Record<string, unknown> = {};
  const globals: Record<string, unknown> = {};

  return {
    workflowId: 'test-workflow',
    instanceId: 'test-instance',
    getStepOutput: (stepId: string) => stepOutputs[stepId],
    setStepOutput: (stepId: string, output: unknown) => {
      stepOutputs[stepId] = output;
    },
    getGlobal: (key: string) => globals[key],
    setGlobal: (key: string, value: unknown) => {
      globals[key] = value;
    },
    snapshot: () => ({ stepOutputs: { ...stepOutputs }, globals: { ...globals } }),
  };
}

describe('UIInteractionHandler', () => {
  let registry: UIRegistry;
  let eventEmitter: EventEmitter;
  let handler: UIInteractionHandler;
  let context: Context;

  beforeEach(() => {
    registry = new UIRegistry();
    eventEmitter = new EventEmitter();
    handler = new UIInteractionHandler(
      registry,
      eventEmitter,
      'test-workflow',
      'test-instance'
    );
    context = createMockContext();
  });

  describe('展示型 UI 处理', () => {
    beforeEach(() => {
      // 注册支持展示型的 UI 组件
      registry.register({
        meta: {
          id: 'display-component',
          name: '展示组件',
          supportedModes: [UIMode.DISPLAY],
        },
        renderer: {
          render: async () => ({ rendered: true }),
        },
      });
    });

    it('应该发出 UI 渲染事件', async () => {
      const events: unknown[] = [];
      eventEmitter.on(EventType.UI_RENDER, (event) => {
        events.push(event);
      });

      const config: UIConfig = {
        componentId: 'display-component',
        mode: UIMode.DISPLAY,
        data: { message: '测试消息' },
        timeout: 100,
      };

      await handler.handleUI('step-1', config, context);

      expect(events.length).toBe(1);
      expect((events[0] as any).payload.componentId).toBe('display-component');
      expect((events[0] as any).payload.mode).toBe(UIMode.DISPLAY);
    });

    it('应该在超时后自动继续', async () => {
      const config: UIConfig = {
        componentId: 'display-component',
        mode: UIMode.DISPLAY,
        timeout: 50,
      };

      const startTime = Date.now();
      const result = await handler.handleUI('step-1', config, context);
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.autoCompleted).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    it('应该使用默认超时时间', async () => {
      const config: UIConfig = {
        componentId: 'display-component',
        mode: UIMode.DISPLAY,
        timeout: 50, // 使用较短的超时以加速测试
      };

      const result = await handler.handleUI('step-1', config, context);

      expect(result.success).toBe(true);
      expect(result.autoCompleted).toBe(true);
    });

    it('应该发出 UI 响应事件', async () => {
      const events: unknown[] = [];
      eventEmitter.on(EventType.UI_RESPONSE, (event) => {
        events.push(event);
      });

      const config: UIConfig = {
        componentId: 'display-component',
        mode: UIMode.DISPLAY,
        timeout: 50,
      };

      await handler.handleUI('step-1', config, context);

      expect(events.length).toBe(1);
      expect((events[0] as any).payload.autoCompleted).toBe(true);
    });
  });

  describe('确认型 UI 处理', () => {
    beforeEach(() => {
      // 注册支持确认型的 UI 组件
      registry.register({
        meta: {
          id: 'confirm-component',
          name: '确认组件',
          supportedModes: [UIMode.CONFIRM],
        },
        renderer: {
          render: async () => ({ rendered: true }),
        },
      });
    });

    it('应该等待用户确认', async () => {
      const config: UIConfig = {
        componentId: 'confirm-component',
        mode: UIMode.CONFIRM,
        data: { message: '请确认' },
      };

      // 启动 UI 处理
      const resultPromise = handler.handleUI('step-1', config, context);

      // 验证有等待中的交互
      expect(handler.hasPendingInteractions('step-1')).toBe(true);

      // 模拟用户确认
      const responded = handler.respondToUI('step-1', {
        rendered: true,
        userResponse: { confirmed: true },
      });

      expect(responded).toBe(true);

      const result = await resultPromise;
      expect(result.success).toBe(true);
      expect(result.response).toEqual({ confirmed: true });
    });

    it('应该在超时后返回错误', async () => {
      const config: UIConfig = {
        componentId: 'confirm-component',
        mode: UIMode.CONFIRM,
        timeout: 50,
      };

      const result = await handler.handleUI('step-1', config, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('超时');
    });

    it('应该支持取消等待中的交互', async () => {
      const config: UIConfig = {
        componentId: 'confirm-component',
        mode: UIMode.CONFIRM,
      };

      const resultPromise = handler.handleUI('step-1', config, context);

      // 取消交互
      const cancelled = handler.cancelPendingInteraction('step-1');
      expect(cancelled).toBe(true);

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('取消');
    });
  });

  describe('选择型 UI 处理', () => {
    beforeEach(() => {
      // 注册支持选择型的 UI 组件
      registry.register({
        meta: {
          id: 'select-component',
          name: '选择组件',
          supportedModes: [UIMode.SELECT],
        },
        renderer: {
          render: async () => ({ rendered: true }),
        },
      });
    });

    it('应该等待用户选择', async () => {
      const config: UIConfig = {
        componentId: 'select-component',
        mode: UIMode.SELECT,
        options: [
          { id: 'option-1', label: '选项1', value: 'value1' },
          { id: 'option-2', label: '选项2', value: 'value2' },
        ],
      };

      const resultPromise = handler.handleUI('step-1', config, context);

      // 模拟用户选择
      handler.respondToUI('step-1', {
        rendered: true,
        selectedOption: 'option-1',
        userResponse: { selected: 'option-1' },
      });

      const result = await resultPromise;
      expect(result.success).toBe(true);
      expect(result.selectedOption).toBe('option-1');
    });

    it('应该验证选项是否有效', async () => {
      const config: UIConfig = {
        componentId: 'select-component',
        mode: UIMode.SELECT,
        options: [
          { id: 'option-1', label: '选项1' },
        ],
      };

      const resultPromise = handler.handleUI('step-1', config, context);

      // 模拟选择无效选项
      handler.respondToUI('step-1', {
        rendered: true,
        selectedOption: 'invalid-option',
      });

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('无效的选项');
    });

    it('应该要求提供选中的选项', async () => {
      const config: UIConfig = {
        componentId: 'select-component',
        mode: UIMode.SELECT,
        options: [
          { id: 'option-1', label: '选项1' },
        ],
      };

      const resultPromise = handler.handleUI('step-1', config, context);

      // 模拟未提供选项
      handler.respondToUI('step-1', {
        rendered: true,
        // 没有 selectedOption
      });

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('必须提供选中的选项');
    });

    it('应该拒绝没有选项的选择型 UI', async () => {
      const config: UIConfig = {
        componentId: 'select-component',
        mode: UIMode.SELECT,
        // 没有 options
      };

      const result = await handler.handleUI('step-1', config, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('必须配置选项');
    });

    it('应该能获取选项值', () => {
      const options = [
        { id: 'opt-1', label: '选项1', value: { key: 'value1' } },
        { id: 'opt-2', label: '选项2', value: 'simple-value' },
      ];

      expect(handler.getOptionValue(options, 'opt-1')).toEqual({ key: 'value1' });
      expect(handler.getOptionValue(options, 'opt-2')).toBe('simple-value');
      // 未找到选项时返回选项 ID
      expect(handler.getOptionValue(options, 'opt-3')).toBe('opt-3');
    });
  });

  describe('错误处理', () => {
    it('应该处理未注册的 UI 组件', async () => {
      const config: UIConfig = {
        componentId: 'unknown-component',
        mode: UIMode.DISPLAY,
      };

      const result = await handler.handleUI('step-1', config, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('未注册');
    });

    it('应该处理不支持的交互模式', async () => {
      // 注册只支持展示型的组件
      registry.register({
        meta: {
          id: 'display-only',
          name: '仅展示组件',
          supportedModes: [UIMode.DISPLAY],
        },
        renderer: {
          render: async () => ({ rendered: true }),
        },
      });

      const config: UIConfig = {
        componentId: 'display-only',
        mode: UIMode.CONFIRM, // 不支持的模式
      };

      const result = await handler.handleUI('step-1', config, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('不支持');
    });
  });

  describe('等待状态管理', () => {
    beforeEach(() => {
      registry.register({
        meta: {
          id: 'confirm-component',
          name: '确认组件',
          supportedModes: [UIMode.CONFIRM],
        },
        renderer: {
          render: async () => ({ rendered: true }),
        },
      });
    });

    it('应该正确报告等待中的交互数量', async () => {
      expect(handler.getPendingInteractionCount()).toBe(0);

      const config: UIConfig = {
        componentId: 'confirm-component',
        mode: UIMode.CONFIRM,
      };

      handler.handleUI('step-1', config, context);
      handler.handleUI('step-2', config, context);

      expect(handler.getPendingInteractionCount()).toBe(2);
      expect(handler.hasPendingInteractions()).toBe(true);
      expect(handler.hasPendingInteractions('step-1')).toBe(true);
      expect(handler.hasPendingInteractions('step-3')).toBe(false);
    });

    it('应该在响应后移除等待记录', async () => {
      const config: UIConfig = {
        componentId: 'confirm-component',
        mode: UIMode.CONFIRM,
      };

      handler.handleUI('step-1', config, context);
      expect(handler.hasPendingInteractions('step-1')).toBe(true);

      handler.respondToUI('step-1', { rendered: true });
      expect(handler.hasPendingInteractions('step-1')).toBe(false);
    });

    it('应该对不存在的交互返回 false', () => {
      const responded = handler.respondToUI('non-existent', { rendered: true });
      expect(responded).toBe(false);

      const cancelled = handler.cancelPendingInteraction('non-existent');
      expect(cancelled).toBe(false);
    });
  });
});

