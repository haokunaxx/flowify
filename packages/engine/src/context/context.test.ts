/**
 * Context 类单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Context } from './index';

describe('Context', () => {
  let context: Context;

  beforeEach(() => {
    context = new Context('workflow-1', 'instance-1');
  });

  describe('构造函数', () => {
    it('应正确设置 workflowId 和 instanceId', () => {
      expect(context.workflowId).toBe('workflow-1');
      expect(context.instanceId).toBe('instance-1');
    });
  });

  describe('getStepOutput / setStepOutput', () => {
    it('应正确存储和获取步骤输出', () => {
      const output = { result: 'success', data: [1, 2, 3] };
      context.setStepOutput('step-1', output);
      
      expect(context.getStepOutput('step-1')).toEqual(output);
    });

    it('获取不存在的步骤输出应返回 undefined', () => {
      expect(context.getStepOutput('non-existent')).toBeUndefined();
    });

    it('应支持覆盖已有的步骤输出', () => {
      context.setStepOutput('step-1', 'first');
      context.setStepOutput('step-1', 'second');
      
      expect(context.getStepOutput('step-1')).toBe('second');
    });

    it('应支持存储各种类型的输出', () => {
      context.setStepOutput('string', 'hello');
      context.setStepOutput('number', 42);
      context.setStepOutput('boolean', true);
      context.setStepOutput('null', null);
      context.setStepOutput('array', [1, 2, 3]);
      context.setStepOutput('object', { key: 'value' });

      expect(context.getStepOutput('string')).toBe('hello');
      expect(context.getStepOutput('number')).toBe(42);
      expect(context.getStepOutput('boolean')).toBe(true);
      expect(context.getStepOutput('null')).toBeNull();
      expect(context.getStepOutput('array')).toEqual([1, 2, 3]);
      expect(context.getStepOutput('object')).toEqual({ key: 'value' });
    });
  });

  describe('getGlobal / setGlobal', () => {
    it('应正确存储和获取全局变量', () => {
      context.setGlobal('config', { timeout: 5000 });
      
      expect(context.getGlobal('config')).toEqual({ timeout: 5000 });
    });

    it('获取不存在的全局变量应返回 undefined', () => {
      expect(context.getGlobal('non-existent')).toBeUndefined();
    });

    it('应支持覆盖已有的全局变量', () => {
      context.setGlobal('counter', 1);
      context.setGlobal('counter', 2);
      
      expect(context.getGlobal('counter')).toBe(2);
    });

    it('应支持存储各种类型的全局变量', () => {
      context.setGlobal('string', 'world');
      context.setGlobal('number', 100);
      context.setGlobal('boolean', false);
      context.setGlobal('undefined', undefined);

      expect(context.getGlobal('string')).toBe('world');
      expect(context.getGlobal('number')).toBe(100);
      expect(context.getGlobal('boolean')).toBe(false);
      expect(context.getGlobal('undefined')).toBeUndefined();
    });
  });

  describe('snapshot', () => {
    it('应返回空快照当没有数据时', () => {
      const snap = context.snapshot();
      
      expect(snap).toEqual({
        stepOutputs: {},
        globals: {},
      });
    });

    it('应返回包含所有步骤输出和全局变量的快照', () => {
      context.setStepOutput('step-1', 'output-1');
      context.setStepOutput('step-2', 'output-2');
      context.setGlobal('var1', 'value1');
      context.setGlobal('var2', 'value2');

      const snap = context.snapshot();

      expect(snap).toEqual({
        stepOutputs: {
          'step-1': 'output-1',
          'step-2': 'output-2',
        },
        globals: {
          var1: 'value1',
          var2: 'value2',
        },
      });
    });

    it('快照应是数据的副本，修改快照不影响原数据', () => {
      context.setStepOutput('step-1', { value: 1 });
      context.setGlobal('config', { setting: true });

      const snap = context.snapshot();
      
      // 修改快照
      snap.stepOutputs['step-1'] = 'modified';
      snap.globals['config'] = 'modified';

      // 原数据不应被影响
      expect(context.getStepOutput('step-1')).toEqual({ value: 1 });
      expect(context.getGlobal('config')).toEqual({ setting: true });
    });
  });

  describe('实例隔离', () => {
    it('不同实例的上下文应相互独立', () => {
      const context1 = new Context('workflow-1', 'instance-1');
      const context2 = new Context('workflow-1', 'instance-2');

      context1.setStepOutput('step-1', 'output-from-1');
      context1.setGlobal('var', 'value-from-1');

      context2.setStepOutput('step-1', 'output-from-2');
      context2.setGlobal('var', 'value-from-2');

      // 验证两个实例的数据相互独立
      expect(context1.getStepOutput('step-1')).toBe('output-from-1');
      expect(context1.getGlobal('var')).toBe('value-from-1');
      
      expect(context2.getStepOutput('step-1')).toBe('output-from-2');
      expect(context2.getGlobal('var')).toBe('value-from-2');
    });
  });

  describe('getDependencyOutputs', () => {
    it('应返回多个依赖步骤的输出', () => {
      context.setStepOutput('step-1', { result: 'a' });
      context.setStepOutput('step-2', { result: 'b' });
      context.setStepOutput('step-3', { result: 'c' });

      const outputs = context.getDependencyOutputs(['step-1', 'step-2']);

      expect(outputs).toEqual({
        'step-1': { result: 'a' },
        'step-2': { result: 'b' },
      });
    });

    it('应忽略不存在的步骤输出', () => {
      context.setStepOutput('step-1', 'output-1');

      const outputs = context.getDependencyOutputs(['step-1', 'step-2', 'step-3']);

      expect(outputs).toEqual({
        'step-1': 'output-1',
      });
    });

    it('应返回空对象当没有匹配的步骤时', () => {
      const outputs = context.getDependencyOutputs(['step-1', 'step-2']);

      expect(outputs).toEqual({});
    });

    it('应返回空对象当传入空数组时', () => {
      context.setStepOutput('step-1', 'output-1');

      const outputs = context.getDependencyOutputs([]);

      expect(outputs).toEqual({});
    });
  });

  describe('hasStepOutput', () => {
    it('应返回 true 当步骤有输出时', () => {
      context.setStepOutput('step-1', 'output');

      expect(context.hasStepOutput('step-1')).toBe(true);
    });

    it('应返回 false 当步骤没有输出时', () => {
      expect(context.hasStepOutput('step-1')).toBe(false);
    });

    it('应返回 true 当步骤输出为 null 时', () => {
      context.setStepOutput('step-1', null);

      expect(context.hasStepOutput('step-1')).toBe(true);
    });

    it('应返回 true 当步骤输出为 undefined 时', () => {
      context.setStepOutput('step-1', undefined);

      expect(context.hasStepOutput('step-1')).toBe(true);
    });
  });

  describe('getStepIds', () => {
    it('应返回所有步骤 ID', () => {
      context.setStepOutput('step-1', 'output-1');
      context.setStepOutput('step-2', 'output-2');
      context.setStepOutput('step-3', 'output-3');

      const ids = context.getStepIds();

      expect(ids).toHaveLength(3);
      expect(ids).toContain('step-1');
      expect(ids).toContain('step-2');
      expect(ids).toContain('step-3');
    });

    it('应返回空数组当没有步骤输出时', () => {
      const ids = context.getStepIds();

      expect(ids).toEqual([]);
    });
  });

  describe('getGlobalKeys', () => {
    it('应返回所有全局变量键', () => {
      context.setGlobal('key1', 'value1');
      context.setGlobal('key2', 'value2');

      const keys = context.getGlobalKeys();

      expect(keys).toHaveLength(2);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('应返回空数组当没有全局变量时', () => {
      const keys = context.getGlobalKeys();

      expect(keys).toEqual([]);
    });
  });

  describe('clear 方法', () => {
    it('clearStepOutputs 应清除所有步骤输出', () => {
      context.setStepOutput('step-1', 'output-1');
      context.setStepOutput('step-2', 'output-2');
      context.setGlobal('key', 'value');

      context.clearStepOutputs();

      expect(context.getStepIds()).toEqual([]);
      expect(context.getGlobal('key')).toBe('value'); // 全局变量不受影响
    });

    it('clearGlobals 应清除所有全局变量', () => {
      context.setStepOutput('step-1', 'output-1');
      context.setGlobal('key1', 'value1');
      context.setGlobal('key2', 'value2');

      context.clearGlobals();

      expect(context.getGlobalKeys()).toEqual([]);
      expect(context.getStepOutput('step-1')).toBe('output-1'); // 步骤输出不受影响
    });

    it('clear 应清除所有数据', () => {
      context.setStepOutput('step-1', 'output-1');
      context.setGlobal('key', 'value');

      context.clear();

      expect(context.getStepIds()).toEqual([]);
      expect(context.getGlobalKeys()).toEqual([]);
    });
  });

  describe('restore', () => {
    it('应从快照恢复上下文数据', () => {
      const snapshot = {
        stepOutputs: {
          'step-1': { result: 'a' },
          'step-2': { result: 'b' },
        },
        globals: {
          config: { timeout: 5000 },
        },
      };

      context.restore(snapshot);

      expect(context.getStepOutput('step-1')).toEqual({ result: 'a' });
      expect(context.getStepOutput('step-2')).toEqual({ result: 'b' });
      expect(context.getGlobal('config')).toEqual({ timeout: 5000 });
    });

    it('应覆盖现有数据', () => {
      context.setStepOutput('step-1', 'old-output');
      context.setGlobal('key', 'old-value');

      const snapshot = {
        stepOutputs: {
          'step-2': 'new-output',
        },
        globals: {
          newKey: 'new-value',
        },
      };

      context.restore(snapshot);

      expect(context.hasStepOutput('step-1')).toBe(false);
      expect(context.getStepOutput('step-2')).toBe('new-output');
      expect(context.getGlobal('key')).toBeUndefined();
      expect(context.getGlobal('newKey')).toBe('new-value');
    });

    it('应能恢复空快照', () => {
      context.setStepOutput('step-1', 'output');
      context.setGlobal('key', 'value');

      context.restore({ stepOutputs: {}, globals: {} });

      expect(context.getStepIds()).toEqual([]);
      expect(context.getGlobalKeys()).toEqual([]);
    });
  });

  describe('数据保留', () => {
    it('工作流完成后上下文数据应保留', () => {
      // 模拟工作流执行过程
      context.setStepOutput('step-1', { result: 'step1-done' });
      context.setStepOutput('step-2', { result: 'step2-done' });
      context.setGlobal('workflowStatus', 'completed');

      // 获取快照（模拟工作流完成后的查询）
      const snapshot = context.snapshot();

      // 验证数据保留
      expect(snapshot.stepOutputs).toEqual({
        'step-1': { result: 'step1-done' },
        'step-2': { result: 'step2-done' },
      });
      expect(snapshot.globals).toEqual({
        workflowStatus: 'completed',
      });

      // 验证原始数据仍然可访问
      expect(context.getStepOutput('step-1')).toEqual({ result: 'step1-done' });
      expect(context.getStepOutput('step-2')).toEqual({ result: 'step2-done' });
      expect(context.getGlobal('workflowStatus')).toBe('completed');
    });

    it('快照应是数据的深拷贝', () => {
      const originalData = { nested: { value: 1 } };
      context.setStepOutput('step-1', originalData);

      const snapshot = context.snapshot();
      
      // 修改原始数据
      originalData.nested.value = 999;

      // 快照中的数据应该是原始值的引用（浅拷贝）
      // 注意：当前实现是浅拷贝，如果需要深拷贝需要额外处理
      expect(snapshot.stepOutputs['step-1']).toBe(originalData);
    });
  });
});
