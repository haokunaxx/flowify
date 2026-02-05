/**
 * 执行器模块测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RetryStrategy,
  SkipStrategy,
  Executor,
  createDefaultRetryPolicy,
  collectDependencyOutputs,
  createDependencyInput,
  type StepExecuteFn,
  type StepResult,
  type DependencyInput,
} from './index';
import { Context } from '../context';
import { HookManager } from '../hooks';
import { EventEmitter, EventType } from '../events';
import { StepStatus, type StepDefinition, type RetryPolicy, type SkipPolicy } from '../core/types';

describe('RetryStrategy', () => {
  describe('重试次数控制', () => {
    it('应该正确判断是否可以重试', () => {
      const policy: RetryPolicy = {
        maxRetries: 3,
        retryInterval: 100,
      };
      const strategy = new RetryStrategy(policy);

      // 初始状态可以重试
      expect(strategy.canRetry()).toBe(true);
      expect(strategy.getRetryCount()).toBe(0);

      // 记录重试
      strategy.recordRetry();
      expect(strategy.canRetry()).toBe(true);
      expect(strategy.getRetryCount()).toBe(1);

      strategy.recordRetry();
      expect(strategy.canRetry()).toBe(true);
      expect(strategy.getRetryCount()).toBe(2);

      strategy.recordRetry();
      expect(strategy.canRetry()).toBe(false);
      expect(strategy.getRetryCount()).toBe(3);
    });

    it('应该正确重置重试计数', () => {
      const policy: RetryPolicy = {
        maxRetries: 2,
        retryInterval: 100,
      };
      const strategy = new RetryStrategy(policy);

      strategy.recordRetry();
      strategy.recordRetry();
      expect(strategy.canRetry()).toBe(false);

      strategy.reset();
      expect(strategy.canRetry()).toBe(true);
      expect(strategy.getRetryCount()).toBe(0);
    });
  });

  describe('重试间隔计算', () => {
    it('应该返回固定间隔（无指数退避）', () => {
      const policy: RetryPolicy = {
        maxRetries: 3,
        retryInterval: 1000,
        exponentialBackoff: false,
      };
      const strategy = new RetryStrategy(policy);

      expect(strategy.getNextRetryInterval()).toBe(1000);
      strategy.recordRetry();
      expect(strategy.getNextRetryInterval()).toBe(1000);
      strategy.recordRetry();
      expect(strategy.getNextRetryInterval()).toBe(1000);
    });

    it('应该计算指数退避间隔（默认倍数 2）', () => {
      const policy: RetryPolicy = {
        maxRetries: 5,
        retryInterval: 100,
        exponentialBackoff: true,
      };
      const strategy = new RetryStrategy(policy);

      // 第 1 次重试前：100 × 2^0 = 100
      expect(strategy.getNextRetryInterval()).toBe(100);
      
      strategy.recordRetry();
      // 第 2 次重试前：100 × 2^1 = 200
      expect(strategy.getNextRetryInterval()).toBe(200);
      
      strategy.recordRetry();
      // 第 3 次重试前：100 × 2^2 = 400
      expect(strategy.getNextRetryInterval()).toBe(400);
      
      strategy.recordRetry();
      // 第 4 次重试前：100 × 2^3 = 800
      expect(strategy.getNextRetryInterval()).toBe(800);
    });

    it('应该使用自定义退避倍数', () => {
      const policy: RetryPolicy = {
        maxRetries: 3,
        retryInterval: 100,
        exponentialBackoff: true,
        backoffMultiplier: 3,
      };
      const strategy = new RetryStrategy(policy);

      // 第 1 次重试前：100 × 3^0 = 100
      expect(strategy.getNextRetryInterval()).toBe(100);
      
      strategy.recordRetry();
      // 第 2 次重试前：100 × 3^1 = 300
      expect(strategy.getNextRetryInterval()).toBe(300);
      
      strategy.recordRetry();
      // 第 3 次重试前：100 × 3^2 = 900
      expect(strategy.getNextRetryInterval()).toBe(900);
    });
  });

  describe('等待重试', () => {
    it('应该等待指定的间隔时间', async () => {
      const policy: RetryPolicy = {
        maxRetries: 3,
        retryInterval: 50,
      };
      const strategy = new RetryStrategy(policy);

      const start = Date.now();
      await strategy.waitForRetry();
      const elapsed = Date.now() - start;

      // 允许一定的误差
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });
});

describe('SkipStrategy', () => {
  let context: Context;

  beforeEach(() => {
    context = new Context('workflow-1', 'instance-1');
  });

  describe('函数条件', () => {
    it('应该正确评估函数条件（返回 true）', () => {
      const policy: SkipPolicy = {
        condition: () => true,
        defaultOutput: 'skipped',
      };
      const strategy = new SkipStrategy(policy);

      expect(strategy.shouldSkip(context)).toBe(true);
    });

    it('应该正确评估函数条件（返回 false）', () => {
      const policy: SkipPolicy = {
        condition: () => false,
      };
      const strategy = new SkipStrategy(policy);

      expect(strategy.shouldSkip(context)).toBe(false);
    });

    it('应该基于上下文数据评估条件', () => {
      context.setStepOutput('step-1', { status: 'completed' });
      
      const policy: SkipPolicy = {
        condition: (ctx) => ctx.getStepOutput('step-1') !== undefined,
      };
      const strategy = new SkipStrategy(policy);

      expect(strategy.shouldSkip(context)).toBe(true);
    });

    it('应该基于前置步骤结果判断跳过', () => {
      context.setStepOutput('choose', { selectedOption: 'fast' });
      
      // 如果选择不是 'full'，则跳过
      const policy: SkipPolicy = {
        condition: (ctx) => {
          const output = ctx.getStepOutput('choose') as { selectedOption: string } | undefined;
          return output?.selectedOption !== 'full';
        },
        defaultOutput: null,
      };
      const strategy = new SkipStrategy(policy);

      expect(strategy.shouldSkip(context)).toBe(true);
    });
  });

  describe('字符串表达式条件', () => {
    it('应该评估简单的字符串表达式', () => {
      context.setGlobal('skipFlag', true);
      
      const policy: SkipPolicy = {
        condition: 'ctx.globals.skipFlag === true',
      };
      const strategy = new SkipStrategy(policy);

      expect(strategy.shouldSkip(context)).toBe(true);
    });

    it('应该评估基于步骤输出的表达式', () => {
      context.setStepOutput('step-1', { value: 100 });
      
      const policy: SkipPolicy = {
        condition: 'ctx.stepOutputs["step-1"]?.value > 50',
      };
      const strategy = new SkipStrategy(policy);

      expect(strategy.shouldSkip(context)).toBe(true);
    });

    it('应该在表达式求值失败时返回 false', () => {
      const policy: SkipPolicy = {
        condition: 'invalid syntax {{{{',
      };
      const strategy = new SkipStrategy(policy);

      // 应该捕获错误并返回 false
      expect(strategy.shouldSkip(context)).toBe(false);
    });
  });

  describe('默认输出', () => {
    it('应该返回配置的默认输出', () => {
      const policy: SkipPolicy = {
        condition: () => true,
        defaultOutput: { status: 'skipped', data: null },
      };
      const strategy = new SkipStrategy(policy);

      expect(strategy.getDefaultOutput()).toEqual({ status: 'skipped', data: null });
    });

    it('应该返回 undefined 如果未配置默认输出', () => {
      const policy: SkipPolicy = {
        condition: () => true,
      };
      const strategy = new SkipStrategy(policy);

      expect(strategy.getDefaultOutput()).toBeUndefined();
    });
  });
});

describe('Executor', () => {
  let hookManager: HookManager;
  let eventEmitter: EventEmitter;
  let context: Context;
  let executor: Executor;

  beforeEach(() => {
    hookManager = new HookManager();
    eventEmitter = new EventEmitter();
    context = new Context('workflow-1', 'instance-1');
    executor = new Executor(hookManager, eventEmitter, 'workflow-1', 'instance-1');
  });

  // 创建简单的步骤定义
  const createStep = (id: string, overrides?: Partial<StepDefinition>): StepDefinition => ({
    id,
    name: `Step ${id}`,
    type: 'task',
    ...overrides,
  });

  // 创建成功的执行函数
  const successExecuteFn: StepExecuteFn = async (step, input) => {
    return { result: 'success', input };
  };

  // 创建失败的执行函数
  const failExecuteFn: StepExecuteFn = async () => {
    throw new Error('执行失败');
  };

  describe('基本执行', () => {
    it('应该成功执行步骤', async () => {
      const step = createStep('step-1');
      const result = await executor.executeStep(step, context, successExecuteFn, { data: 'test' });

      expect(result.status).toBe(StepStatus.SUCCESS);
      expect(result.output).toEqual({ result: 'success', input: { data: 'test' } });
    });

    it('应该处理执行失败', async () => {
      const step = createStep('step-1');
      const result = await executor.executeStep(step, context, failExecuteFn);

      expect(result.status).toBe(StepStatus.FAILED);
      expect(result.error).toBeDefined();
    });

    it('应该将成功输出存储到上下文', async () => {
      const step = createStep('step-1');
      await executor.executeStep(step, context, successExecuteFn, { data: 'test' });

      expect(context.getStepOutput('step-1')).toEqual({ result: 'success', input: { data: 'test' } });
    });
  });

  describe('跳过策略', () => {
    it('应该在满足跳过条件时跳过步骤', async () => {
      const step = createStep('step-1', {
        skipPolicy: {
          condition: () => true,
          defaultOutput: 'skipped-output',
        },
      });

      const result = await executor.executeStep(step, context, successExecuteFn);

      expect(result.status).toBe(StepStatus.SKIPPED);
      expect(result.output).toBe('skipped-output');
    });

    it('应该在不满足跳过条件时正常执行', async () => {
      const step = createStep('step-1', {
        skipPolicy: {
          condition: () => false,
        },
      });

      const result = await executor.executeStep(step, context, successExecuteFn);

      expect(result.status).toBe(StepStatus.SUCCESS);
    });

    it('应该将跳过的默认输出存储到上下文', async () => {
      const step = createStep('step-1', {
        skipPolicy: {
          condition: () => true,
          defaultOutput: { skipped: true },
        },
      });

      await executor.executeStep(step, context, successExecuteFn);

      expect(context.getStepOutput('step-1')).toEqual({ skipped: true });
    });

    it('应该发出跳过事件', async () => {
      const events: unknown[] = [];
      eventEmitter.on(EventType.STEP_SKIP, (event) => events.push(event));

      const step = createStep('step-1', {
        skipPolicy: {
          condition: () => true,
        },
      });

      await executor.executeStep(step, context, successExecuteFn);

      expect(events.length).toBe(1);
    });
  });

  describe('重试策略', () => {
    it('应该在失败后重试', async () => {
      let attempts = 0;
      const executeFn: StepExecuteFn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('失败');
        }
        return { success: true };
      };

      const step = createStep('step-1', {
        retryPolicy: {
          maxRetries: 3,
          retryInterval: 10,
        },
      });

      const result = await executor.executeStep(step, context, executeFn);

      expect(result.status).toBe(StepStatus.SUCCESS);
      expect(attempts).toBe(3);
      expect(result.retryCount).toBe(2);
    });

    it('应该在重试次数耗尽后失败', async () => {
      const step = createStep('step-1', {
        retryPolicy: {
          maxRetries: 2,
          retryInterval: 10,
        },
      });

      const result = await executor.executeStep(step, context, failExecuteFn);

      expect(result.status).toBe(StepStatus.FAILED);
      expect(result.retryCount).toBe(2);
    });

    it('应该发出重试事件', async () => {
      const retryEvents: unknown[] = [];
      eventEmitter.on(EventType.STEP_RETRY, (event) => retryEvents.push(event));

      const step = createStep('step-1', {
        retryPolicy: {
          maxRetries: 2,
          retryInterval: 10,
        },
      });

      await executor.executeStep(step, context, failExecuteFn);

      expect(retryEvents.length).toBe(2);
    });
  });

  describe('Hook 集成', () => {
    it('应该在步骤执行前执行 beforeHook', async () => {
      const hookOrder: string[] = [];
      
      hookManager.addGlobalBeforeHook({
        id: 'before-1',
        name: 'Before Hook',
        handler: async () => {
          hookOrder.push('before');
        },
      });

      const executeFn: StepExecuteFn = async () => {
        hookOrder.push('execute');
        return {};
      };

      const step = createStep('step-1');
      await executor.executeStep(step, context, executeFn);

      expect(hookOrder).toEqual(['before', 'execute']);
    });

    it('应该在步骤执行后执行 afterHook', async () => {
      const hookOrder: string[] = [];
      
      hookManager.addGlobalAfterHook({
        id: 'after-1',
        name: 'After Hook',
        handler: async () => {
          hookOrder.push('after');
        },
      });

      const executeFn: StepExecuteFn = async () => {
        hookOrder.push('execute');
        return {};
      };

      const step = createStep('step-1');
      await executor.executeStep(step, context, executeFn);

      expect(hookOrder).toEqual(['execute', 'after']);
    });

    it('应该在 beforeHook 失败时阻止步骤执行', async () => {
      let executed = false;
      
      hookManager.addGlobalBeforeHook({
        id: 'before-1',
        name: 'Failing Before Hook',
        handler: async () => {
          throw new Error('Hook 失败');
        },
      });

      const executeFn: StepExecuteFn = async () => {
        executed = true;
        return {};
      };

      const step = createStep('step-1');
      const result = await executor.executeStep(step, context, executeFn);

      expect(result.status).toBe(StepStatus.FAILED);
      expect(executed).toBe(false);
    });

    it('应该允许 beforeHook 修改输入', async () => {
      hookManager.addGlobalBeforeHook({
        id: 'modify-input',
        name: 'Modify Input Hook',
        handler: async (ctx) => {
          ctx.modifyInput({ modified: true, original: ctx.stepInput });
        },
      });

      let receivedInput: unknown;
      const executeFn: StepExecuteFn = async (step, input) => {
        receivedInput = input;
        return {};
      };

      const step = createStep('step-1');
      await executor.executeStep(step, context, executeFn, { original: 'data' });

      expect(receivedInput).toEqual({ modified: true, original: { original: 'data' } });
    });
  });

  describe('取消步骤', () => {
    it('应该能够取消步骤执行', async () => {
      await executor.cancelStep('step-1');
      
      const step = createStep('step-1');
      const result = await executor.executeStep(step, context, successExecuteFn);

      expect(result.status).toBe(StepStatus.FAILED);
      expect(result.error?.message).toContain('取消');
    });

    it('应该能够检查步骤是否已取消', async () => {
      expect(executor.isCancelled('step-1')).toBe(false);
      
      await executor.cancelStep('step-1');
      
      expect(executor.isCancelled('step-1')).toBe(true);
    });

    it('应该能够清除取消标记', async () => {
      await executor.cancelStep('step-1');
      expect(executor.isCancelled('step-1')).toBe(true);
      
      executor.clearCancellation('step-1');
      expect(executor.isCancelled('step-1')).toBe(false);
    });
  });
});

describe('createDefaultRetryPolicy', () => {
  it('应该创建默认重试策略', () => {
    const policy = createDefaultRetryPolicy();

    expect(policy.maxRetries).toBe(3);
    expect(policy.retryInterval).toBe(1000);
    expect(policy.exponentialBackoff).toBe(false);
  });
});

describe('collectDependencyOutputs', () => {
  let context: Context;

  beforeEach(() => {
    context = new Context('workflow-1', 'instance-1');
  });

  it('应该收集所有依赖步骤的输出', () => {
    context.setStepOutput('step-a', { result: 'a' });
    context.setStepOutput('step-b', { result: 'b' });

    const step: StepDefinition = {
      id: 'step-c',
      name: 'Step C',
      type: 'task',
      dependencies: ['step-a', 'step-b'],
    };

    const outputs = collectDependencyOutputs(step, context);

    expect(outputs).toEqual({
      'step-a': { result: 'a' },
      'step-b': { result: 'b' },
    });
  });

  it('应该忽略没有输出的依赖步骤', () => {
    context.setStepOutput('step-a', { result: 'a' });

    const step: StepDefinition = {
      id: 'step-c',
      name: 'Step C',
      type: 'task',
      dependencies: ['step-a', 'step-b'],
    };

    const outputs = collectDependencyOutputs(step, context);

    expect(outputs).toEqual({
      'step-a': { result: 'a' },
    });
  });

  it('应该返回空对象当没有依赖时', () => {
    const step: StepDefinition = {
      id: 'step-a',
      name: 'Step A',
      type: 'task',
    };

    const outputs = collectDependencyOutputs(step, context);

    expect(outputs).toEqual({});
  });
});

describe('createDependencyInput', () => {
  let context: Context;

  beforeEach(() => {
    context = new Context('workflow-1', 'instance-1');
  });

  it('应该创建包含依赖输出的输入对象', () => {
    context.setStepOutput('step-a', { result: 'a' });
    context.setStepOutput('step-b', { result: 'b' });

    const step: StepDefinition = {
      id: 'step-c',
      name: 'Step C',
      type: 'task',
      dependencies: ['step-a', 'step-b'],
    };

    const depInput = createDependencyInput(step, context, { original: 'input' });

    expect(depInput).toEqual({
      input: { original: 'input' },
      dependencies: {
        'step-a': { result: 'a' },
        'step-b': { result: 'b' },
      },
    });
  });

  it('应该处理没有原始输入的情况', () => {
    context.setStepOutput('step-a', { result: 'a' });

    const step: StepDefinition = {
      id: 'step-b',
      name: 'Step B',
      type: 'task',
      dependencies: ['step-a'],
    };

    const depInput = createDependencyInput(step, context);

    expect(depInput).toEqual({
      input: undefined,
      dependencies: {
        'step-a': { result: 'a' },
      },
    });
  });

  it('应该处理没有依赖的情况', () => {
    const step: StepDefinition = {
      id: 'step-a',
      name: 'Step A',
      type: 'task',
    };

    const depInput = createDependencyInput(step, context, { data: 'test' });

    expect(depInput).toEqual({
      input: { data: 'test' },
      dependencies: {},
    });
  });
});
