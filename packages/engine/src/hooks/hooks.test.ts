/**
 * Hook 管理模块单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookManager, HookContext } from './index';
import { Context } from '../context';
import type { HookHandler, HookFn } from '@flowify/core';
import { HookExecutionError } from '@flowify/core';

describe('HookContext', () => {
  let context: Context;

  beforeEach(() => {
    context = new Context('workflow-1', 'instance-1');
  });

  it('应该正确初始化 Hook 上下文', () => {
    const hookContext = new HookContext('step-1', { data: 'input' }, context);
    
    expect(hookContext.stepId).toBe('step-1');
    expect(hookContext.stepInput).toEqual({ data: 'input' });
    expect(hookContext.context).toBe(context);
    expect(hookContext.stepOutput).toBeUndefined();
  });

  it('应该正确初始化包含 stepOutput 的 Hook 上下文', () => {
    const hookContext = new HookContext(
      'step-1',
      { data: 'input' },
      context,
      { result: 'output' }
    );
    
    expect(hookContext.stepOutput).toEqual({ result: 'output' });
  });

  it('应该支持修改步骤输入', () => {
    const hookContext = new HookContext('step-1', { data: 'original' }, context);
    
    expect(hookContext.isInputModified()).toBe(false);
    
    hookContext.modifyInput({ data: 'modified' });
    
    expect(hookContext.isInputModified()).toBe(true);
    expect(hookContext.stepInput).toEqual({ data: 'modified' });
    expect(hookContext.getModifiedInput()).toEqual({ data: 'modified' });
  });
});

describe('HookManager', () => {
  let hookManager: HookManager;
  let context: Context;

  beforeEach(() => {
    hookManager = new HookManager();
    context = new Context('workflow-1', 'instance-1');
  });

  describe('全局 Hook 注册', () => {
    it('应该能添加全局 beforeHook', () => {
      const handler: HookHandler = {
        id: 'hook-1',
        name: 'Test Hook',
        handler: vi.fn(),
      };

      hookManager.addGlobalBeforeHook(handler);
      
      expect(hookManager.getGlobalBeforeHooks()).toHaveLength(1);
      expect(hookManager.getGlobalBeforeHooks()[0].id).toBe('hook-1');
    });

    it('应该能添加全局 afterHook', () => {
      const handler: HookHandler = {
        id: 'hook-1',
        name: 'Test Hook',
        handler: vi.fn(),
      };

      hookManager.addGlobalAfterHook(handler);
      
      expect(hookManager.getGlobalAfterHooks()).toHaveLength(1);
      expect(hookManager.getGlobalAfterHooks()[0].id).toBe('hook-1');
    });

    it('应该能通过统一接口添加全局 Hook', () => {
      const beforeHandler: HookHandler = {
        id: 'before-hook',
        name: 'Before Hook',
        handler: vi.fn(),
      };
      const afterHandler: HookHandler = {
        id: 'after-hook',
        name: 'After Hook',
        handler: vi.fn(),
      };

      hookManager.addGlobalHook('before', beforeHandler);
      hookManager.addGlobalHook('after', afterHandler);
      
      expect(hookManager.getGlobalBeforeHooks()).toHaveLength(1);
      expect(hookManager.getGlobalAfterHooks()).toHaveLength(1);
    });

    it('应该防止重复添加相同 ID 的 Hook', () => {
      const handler: HookHandler = {
        id: 'hook-1',
        name: 'Test Hook',
        handler: vi.fn(),
      };

      hookManager.addGlobalBeforeHook(handler);
      hookManager.addGlobalBeforeHook(handler);
      
      expect(hookManager.getGlobalBeforeHooks()).toHaveLength(1);
    });

    it('应该能移除全局 Hook', () => {
      const beforeHandler: HookHandler = {
        id: 'hook-1',
        name: 'Before Hook',
        handler: vi.fn(),
      };
      const afterHandler: HookHandler = {
        id: 'hook-1',
        name: 'After Hook',
        handler: vi.fn(),
      };

      hookManager.addGlobalBeforeHook(beforeHandler);
      hookManager.addGlobalAfterHook(afterHandler);
      
      hookManager.removeGlobalHook('hook-1');
      
      expect(hookManager.getGlobalBeforeHooks()).toHaveLength(0);
      expect(hookManager.getGlobalAfterHooks()).toHaveLength(0);
    });

    it('应该能清除所有全局 Hook', () => {
      hookManager.addGlobalBeforeHook({ id: 'h1', name: 'H1', handler: vi.fn() });
      hookManager.addGlobalAfterHook({ id: 'h2', name: 'H2', handler: vi.fn() });
      
      hookManager.clearGlobalHooks();
      
      expect(hookManager.getGlobalBeforeHooks()).toHaveLength(0);
      expect(hookManager.getGlobalAfterHooks()).toHaveLength(0);
    });
  });

  describe('beforeHook 执行', () => {
    it('应该按顺序执行全局 beforeHook 和步骤 beforeHook', async () => {
      const executionOrder: string[] = [];
      
      const globalHook: HookHandler = {
        id: 'global-before',
        name: 'Global Before',
        handler: async () => { executionOrder.push('global'); },
      };
      
      const stepHook: HookHandler = {
        id: 'step-before',
        name: 'Step Before',
        handler: async () => { executionOrder.push('step'); },
      };

      hookManager.addGlobalBeforeHook(globalHook);
      
      await hookManager.executeBeforeHooks(
        'step-1',
        { data: 'input' },
        context,
        { beforeHooks: [stepHook] }
      );
      
      // 验证执行顺序：全局 beforeHook → 步骤 beforeHook
      expect(executionOrder).toEqual(['global', 'step']);
    });

    it('应该在 beforeHook 失败时返回错误', async () => {
      const failingHook: HookHandler = {
        id: 'failing-hook',
        name: 'Failing Hook',
        handler: async () => { throw new Error('Hook failed'); },
      };

      hookManager.addGlobalBeforeHook(failingHook);
      
      const result = await hookManager.executeBeforeHooks(
        'step-1',
        { data: 'input' },
        context
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(HookExecutionError);
      expect(result.error?.hookId).toBe('failing-hook');
      expect(result.error?.hookType).toBe('before');
    });

    it('应该在 beforeHook 失败时阻止后续 Hook 执行', async () => {
      const executionOrder: string[] = [];
      
      const hook1: HookHandler = {
        id: 'hook-1',
        name: 'Hook 1',
        handler: async () => { executionOrder.push('hook-1'); },
      };
      
      const failingHook: HookHandler = {
        id: 'failing-hook',
        name: 'Failing Hook',
        handler: async () => { throw new Error('Failed'); },
      };
      
      const hook3: HookHandler = {
        id: 'hook-3',
        name: 'Hook 3',
        handler: async () => { executionOrder.push('hook-3'); },
      };

      hookManager.addGlobalBeforeHook(hook1);
      hookManager.addGlobalBeforeHook(failingHook);
      hookManager.addGlobalBeforeHook(hook3);
      
      await hookManager.executeBeforeHooks('step-1', {}, context);
      
      // hook-3 不应该被执行
      expect(executionOrder).toEqual(['hook-1']);
    });

    it('应该支持在 beforeHook 中修改输入', async () => {
      const modifyingHook: HookHandler = {
        id: 'modifying-hook',
        name: 'Modifying Hook',
        handler: async (ctx) => {
          ctx.modifyInput({ data: 'modified' });
        },
      };

      hookManager.addGlobalBeforeHook(modifyingHook);
      
      const result = await hookManager.executeBeforeHooks(
        'step-1',
        { data: 'original' },
        context
      );
      
      expect(result.success).toBe(true);
      expect(result.modifiedInput).toEqual({ data: 'modified' });
    });

    it('应该在没有修改时返回原始输入', async () => {
      const noopHook: HookHandler = {
        id: 'noop-hook',
        name: 'Noop Hook',
        handler: async () => {},
      };

      hookManager.addGlobalBeforeHook(noopHook);
      
      const originalInput = { data: 'original' };
      const result = await hookManager.executeBeforeHooks(
        'step-1',
        originalInput,
        context
      );
      
      expect(result.success).toBe(true);
      expect(result.modifiedInput).toEqual(originalInput);
    });
  });

  describe('afterHook 执行', () => {
    it('应该按顺序执行步骤 afterHook 和全局 afterHook', async () => {
      const executionOrder: string[] = [];
      
      const globalHook: HookHandler = {
        id: 'global-after',
        name: 'Global After',
        handler: async () => { executionOrder.push('global'); },
      };
      
      const stepHook: HookHandler = {
        id: 'step-after',
        name: 'Step After',
        handler: async () => { executionOrder.push('step'); },
      };

      hookManager.addGlobalAfterHook(globalHook);
      
      await hookManager.executeAfterHooks(
        'step-1',
        { data: 'input' },
        { result: 'output' },
        context,
        { afterHooks: [stepHook] }
      );
      
      // 验证执行顺序：步骤 afterHook → 全局 afterHook
      expect(executionOrder).toEqual(['step', 'global']);
    });

    it('afterHook 失败不应阻止后续 Hook 执行', async () => {
      const executionOrder: string[] = [];
      
      const failingHook: HookHandler = {
        id: 'failing-hook',
        name: 'Failing Hook',
        handler: async () => { throw new Error('Failed'); },
      };
      
      const hook2: HookHandler = {
        id: 'hook-2',
        name: 'Hook 2',
        handler: async () => { executionOrder.push('hook-2'); },
      };

      hookManager.addGlobalAfterHook(failingHook);
      hookManager.addGlobalAfterHook(hook2);
      
      const result = await hookManager.executeAfterHooks(
        'step-1',
        {},
        {},
        context
      );
      
      // hook-2 应该被执行
      expect(executionOrder).toEqual(['hook-2']);
      // 结果仍然是成功的
      expect(result.success).toBe(true);
      // 但应该记录错误
      expect(result.error).toBeInstanceOf(HookExecutionError);
    });

    it('afterHook 应该能访问步骤输出', async () => {
      let capturedOutput: unknown;
      
      const hook: HookHandler = {
        id: 'capture-hook',
        name: 'Capture Hook',
        handler: async (ctx) => {
          capturedOutput = ctx.stepOutput;
        },
      };

      hookManager.addGlobalAfterHook(hook);
      
      await hookManager.executeAfterHooks(
        'step-1',
        { data: 'input' },
        { result: 'output' },
        context
      );
      
      expect(capturedOutput).toEqual({ result: 'output' });
    });
  });

  describe('Hook 执行顺序（完整流程）', () => {
    it('应该按正确顺序执行所有 Hook', async () => {
      const executionOrder: string[] = [];
      
      // 全局 Hook
      const globalBefore: HookHandler = {
        id: 'global-before',
        name: 'Global Before',
        handler: async () => { executionOrder.push('global-before'); },
      };
      const globalAfter: HookHandler = {
        id: 'global-after',
        name: 'Global After',
        handler: async () => { executionOrder.push('global-after'); },
      };
      
      // 步骤级 Hook
      const stepBefore: HookHandler = {
        id: 'step-before',
        name: 'Step Before',
        handler: async () => { executionOrder.push('step-before'); },
      };
      const stepAfter: HookHandler = {
        id: 'step-after',
        name: 'Step After',
        handler: async () => { executionOrder.push('step-after'); },
      };

      hookManager.addGlobalBeforeHook(globalBefore);
      hookManager.addGlobalAfterHook(globalAfter);
      
      const stepHooks = {
        beforeHooks: [stepBefore],
        afterHooks: [stepAfter],
      };

      // 执行 beforeHook
      await hookManager.executeBeforeHooks('step-1', {}, context, stepHooks);
      
      // 模拟步骤执行
      executionOrder.push('step-execution');
      
      // 执行 afterHook
      await hookManager.executeAfterHooks('step-1', {}, {}, context, stepHooks);
      
      // 验证完整执行顺序
      expect(executionOrder).toEqual([
        'global-before',
        'step-before',
        'step-execution',
        'step-after',
        'global-after',
      ]);
    });
  });

  describe('需求验证 - Requirements 9.4, 9.5, 9.6', () => {
    it('Req 9.4: Hook 应该能够访问和修改步骤的输入参数', async () => {
      // 创建一个修改输入的 Hook
      const modifyingHook: HookHandler = {
        id: 'input-modifier',
        name: 'Input Modifier',
        handler: async (ctx) => {
          // 访问原始输入
          const originalInput = ctx.stepInput as { value: number };
          // 修改输入
          ctx.modifyInput({ value: originalInput.value * 2 });
        },
      };

      hookManager.addGlobalBeforeHook(modifyingHook);
      
      const result = await hookManager.executeBeforeHooks(
        'step-1',
        { value: 10 },
        context
      );
      
      expect(result.success).toBe(true);
      expect(result.modifiedInput).toEqual({ value: 20 });
    });

    it('Req 9.5: afterHook 应该能够访问步骤的执行结果', async () => {
      let capturedOutput: unknown;
      let capturedInput: unknown;
      
      const inspectingHook: HookHandler = {
        id: 'output-inspector',
        name: 'Output Inspector',
        handler: async (ctx) => {
          capturedInput = ctx.stepInput;
          capturedOutput = ctx.stepOutput;
        },
      };

      hookManager.addGlobalAfterHook(inspectingHook);
      
      const stepInput = { request: 'data' };
      const stepOutput = { response: 'result', status: 200 };
      
      await hookManager.executeAfterHooks(
        'step-1',
        stepInput,
        stepOutput,
        context
      );
      
      expect(capturedInput).toEqual(stepInput);
      expect(capturedOutput).toEqual(stepOutput);
    });

    it('Req 9.6: beforeHook 执行失败应该阻止步骤执行', async () => {
      let stepExecuted = false;
      
      const failingHook: HookHandler = {
        id: 'failing-hook',
        name: 'Failing Hook',
        handler: async () => {
          throw new Error('Validation failed');
        },
      };

      hookManager.addGlobalBeforeHook(failingHook);
      
      const result = await hookManager.executeBeforeHooks(
        'step-1',
        {},
        context
      );
      
      // beforeHook 失败
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(HookExecutionError);
      expect(result.error?.hookType).toBe('before');
      
      // 模拟：只有在 beforeHook 成功时才执行步骤
      if (result.success) {
        stepExecuted = true;
      }
      
      // 步骤不应该被执行
      expect(stepExecuted).toBe(false);
    });

    it('Req 9.6: beforeHook 失败应该返回包含错误信息的结果', async () => {
      const errorMessage = 'Custom validation error';
      
      const failingHook: HookHandler = {
        id: 'validation-hook',
        name: 'Validation Hook',
        handler: async () => {
          throw new Error(errorMessage);
        },
      };

      hookManager.addGlobalBeforeHook(failingHook);
      
      const result = await hookManager.executeBeforeHooks(
        'step-1',
        {},
        context
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.originalError?.message).toBe(errorMessage);
      expect(result.error?.stepId).toBe('step-1');
    });
  });
});
