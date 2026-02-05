/**
 * 注册表模块单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry, UIRegistry } from './index';
import {
  ToolMeta,
  ToolRegistration,
  UIComponentMeta,
  UIComponentRegistration,
  ToolMode,
  UIMode,
  Context,
} from '@flowify/core';
import { ToolNotFoundError, UIComponentNotFoundError } from '@flowify/core';

// 创建模拟上下文
const createMockContext = (): Context => ({
  workflowId: 'test-workflow',
  instanceId: 'test-instance',
  getStepOutput: () => undefined,
  setStepOutput: () => {},
  getGlobal: () => undefined,
  setGlobal: () => {},
  snapshot: () => ({ stepOutputs: {}, globals: {} }),
});

// 创建测试用工具注册项
const createToolRegistration = (id: string, name?: string): ToolRegistration => ({
  meta: {
    id,
    name: name || `工具-${id}`,
    mode: ToolMode.SYNC,
    description: `测试工具 ${id}`,
  },
  executor: {
    execute: async () => ({ result: 'success' }),
  },
});

// 创建测试用 UI 组件注册项
const createUIRegistration = (id: string, name?: string): UIComponentRegistration => ({
  meta: {
    id,
    name: name || `组件-${id}`,
    supportedModes: [UIMode.DISPLAY, UIMode.CONFIRM],
    description: `测试组件 ${id}`,
  },
  renderer: {
    render: async () => ({ rendered: true }),
  },
});

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('应该成功注册工具', () => {
      const registration = createToolRegistration('tool-1');
      registry.register(registration);
      expect(registry.has('tool-1')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('应该拒绝重复注册相同 ID 的工具', () => {
      const registration = createToolRegistration('tool-1');
      registry.register(registration);
      expect(() => registry.register(registration)).toThrow('工具已存在: tool-1');
    });

    it('应该允许注册多个不同的工具', () => {
      registry.register(createToolRegistration('tool-1'));
      registry.register(createToolRegistration('tool-2'));
      registry.register(createToolRegistration('tool-3'));
      expect(registry.size).toBe(3);
    });
  });

  describe('unregister', () => {
    it('应该成功卸载已注册的工具', () => {
      registry.register(createToolRegistration('tool-1'));
      const result = registry.unregister('tool-1');
      expect(result).toBe(true);
      expect(registry.has('tool-1')).toBe(false);
    });

    it('卸载不存在的工具应返回 false', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('应该返回已注册的工具', () => {
      const registration = createToolRegistration('tool-1', '测试工具');
      registry.register(registration);
      const retrieved = registry.get('tool-1');
      expect(retrieved.meta.id).toBe('tool-1');
      expect(retrieved.meta.name).toBe('测试工具');
    });

    it('获取未注册的工具应抛出 ToolNotFoundError', () => {
      expect(() => registry.get('non-existent')).toThrow(ToolNotFoundError);
      expect(() => registry.get('non-existent')).toThrow('工具未注册: non-existent');
    });
  });

  describe('getAll', () => {
    it('空注册表应返回空数组', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('应该返回所有已注册工具的元数据', () => {
      registry.register(createToolRegistration('tool-1'));
      registry.register(createToolRegistration('tool-2'));
      const allTools = registry.getAll();
      expect(allTools).toHaveLength(2);
      expect(allTools.map((t) => t.id)).toContain('tool-1');
      expect(allTools.map((t) => t.id)).toContain('tool-2');
    });
  });

  describe('has', () => {
    it('已注册的工具应返回 true', () => {
      registry.register(createToolRegistration('tool-1'));
      expect(registry.has('tool-1')).toBe(true);
    });

    it('未注册的工具应返回 false', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('应该清空所有注册的工具', () => {
      registry.register(createToolRegistration('tool-1'));
      registry.register(createToolRegistration('tool-2'));
      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.has('tool-1')).toBe(false);
    });
  });

  describe('工具执行器', () => {
    it('应该能够执行已注册工具的执行器', async () => {
      const registration: ToolRegistration = {
        meta: {
          id: 'calculator',
          name: '计算器',
          mode: ToolMode.SYNC,
        },
        executor: {
          execute: async (params: unknown) => {
            const { a, b } = params as { a: number; b: number };
            return { sum: a + b };
          },
        },
      };
      registry.register(registration);
      const tool = registry.get('calculator');
      const result = await tool.executor.execute({ a: 1, b: 2 }, createMockContext());
      expect(result).toEqual({ sum: 3 });
    });
  });
});

describe('UIRegistry', () => {
  let registry: UIRegistry;

  beforeEach(() => {
    registry = new UIRegistry();
  });

  describe('register', () => {
    it('应该成功注册 UI 组件', () => {
      const registration = createUIRegistration('dialog');
      registry.register(registration);
      expect(registry.has('dialog')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('应该拒绝重复注册相同 ID 的组件', () => {
      const registration = createUIRegistration('dialog');
      registry.register(registration);
      expect(() => registry.register(registration)).toThrow('UI 组件已存在: dialog');
    });

    it('应该允许注册多个不同的组件', () => {
      registry.register(createUIRegistration('dialog'));
      registry.register(createUIRegistration('toast'));
      registry.register(createUIRegistration('modal'));
      expect(registry.size).toBe(3);
    });
  });

  describe('unregister', () => {
    it('应该成功卸载已注册的组件', () => {
      registry.register(createUIRegistration('dialog'));
      const result = registry.unregister('dialog');
      expect(result).toBe(true);
      expect(registry.has('dialog')).toBe(false);
    });

    it('卸载不存在的组件应返回 false', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('应该返回已注册的组件', () => {
      const registration = createUIRegistration('dialog', '对话框');
      registry.register(registration);
      const retrieved = registry.get('dialog');
      expect(retrieved.meta.id).toBe('dialog');
      expect(retrieved.meta.name).toBe('对话框');
    });

    it('获取未注册的组件应抛出 UIComponentNotFoundError', () => {
      expect(() => registry.get('non-existent')).toThrow(UIComponentNotFoundError);
      expect(() => registry.get('non-existent')).toThrow('UI 组件未注册: non-existent');
    });
  });

  describe('getAll', () => {
    it('空注册表应返回空数组', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('应该返回所有已注册组件的元数据', () => {
      registry.register(createUIRegistration('dialog'));
      registry.register(createUIRegistration('toast'));
      const allComponents = registry.getAll();
      expect(allComponents).toHaveLength(2);
      expect(allComponents.map((c) => c.id)).toContain('dialog');
      expect(allComponents.map((c) => c.id)).toContain('toast');
    });
  });

  describe('has', () => {
    it('已注册的组件应返回 true', () => {
      registry.register(createUIRegistration('dialog'));
      expect(registry.has('dialog')).toBe(true);
    });

    it('未注册的组件应返回 false', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('应该清空所有注册的组件', () => {
      registry.register(createUIRegistration('dialog'));
      registry.register(createUIRegistration('toast'));
      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.has('dialog')).toBe(false);
    });
  });

  describe('UI 渲染器', () => {
    it('应该能够执行已注册组件的渲染器', async () => {
      const registration: UIComponentRegistration = {
        meta: {
          id: 'confirm-dialog',
          name: '确认对话框',
          supportedModes: [UIMode.CONFIRM],
        },
        renderer: {
          render: async (config) => ({
            rendered: true,
            userResponse: { confirmed: true },
          }),
        },
      };
      registry.register(registration);
      const component = registry.get('confirm-dialog');
      const result = await component.renderer.render(
        { componentId: 'confirm-dialog', mode: UIMode.CONFIRM },
        createMockContext()
      );
      expect(result.rendered).toBe(true);
      expect(result.userResponse).toEqual({ confirmed: true });
    });
  });
});
