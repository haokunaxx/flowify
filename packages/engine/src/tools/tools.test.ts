/**
 * 工具调用系统测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ToolInvoker,
  validateSchema,
  executeToolInvocations,
} from './index';
import { ToolRegistry } from '../registry';
import { EventEmitter, EventType } from '../events';
import { Context } from '../context';
import { ToolMode, JSONSchema } from '@flowify/core';
import {
  ToolNotFoundError,
  SchemaValidationError,
  TimeoutError,
} from '@flowify/core';

describe('Schema 验证', () => {
  it('应该验证基本类型', () => {
    const stringSchema: JSONSchema = { type: 'string' };
    const numberSchema: JSONSchema = { type: 'number' };
    const booleanSchema: JSONSchema = { type: 'boolean' };

    expect(validateSchema('hello', stringSchema).valid).toBe(true);
    expect(validateSchema(123, numberSchema).valid).toBe(true);
    expect(validateSchema(true, booleanSchema).valid).toBe(true);

    expect(validateSchema(123, stringSchema).valid).toBe(false);
    expect(validateSchema('hello', numberSchema).valid).toBe(false);
    expect(validateSchema('true', booleanSchema).valid).toBe(false);
  });

  it('应该验证对象类型', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    };

    expect(validateSchema({ name: 'Alice', age: 30 }, schema).valid).toBe(true);
    expect(validateSchema({ name: 'Bob' }, schema).valid).toBe(true);

    // 缺少必需字段
    const result = validateSchema({ age: 30 }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });

  it('应该验证数组类型', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: { type: 'number' },
    };

    expect(validateSchema([1, 2, 3], schema).valid).toBe(true);
    expect(validateSchema([], schema).valid).toBe(true);

    const result = validateSchema([1, 'two', 3], schema);
    expect(result.valid).toBe(false);
  });

  it('应该验证嵌套对象', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
      },
    };

    expect(validateSchema({ user: { name: 'Alice' } }, schema).valid).toBe(true);

    const result = validateSchema({ user: { name: 123 } }, schema);
    expect(result.valid).toBe(false);
  });
});

describe('同步工具调用', () => {
  let registry: ToolRegistry;
  let eventEmitter: EventEmitter;
  let invoker: ToolInvoker;
  let context: Context;

  beforeEach(() => {
    registry = new ToolRegistry();
    eventEmitter = new EventEmitter();
    invoker = new ToolInvoker(registry, eventEmitter, 'workflow-1', 'instance-1');
    context = new Context('workflow-1', 'instance-1');
  });

  it('应该成功执行同步工具', async () => {
    // 注册一个简单的同步工具
    registry.register({
      meta: {
        id: 'add',
        name: '加法工具',
        mode: ToolMode.SYNC,
      },
      executor: {
        execute: async (params: unknown) => {
          const { a, b } = params as { a: number; b: number };
          return a + b;
        },
      },
    });

    const result = await invoker.invoke('add', { a: 1, b: 2 }, context);

    expect(result.success).toBe(true);
    expect(result.result).toBe(3);
    expect(result.toolId).toBe('add');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('应该在工具未找到时返回错误', async () => {
    const result = await invoker.invoke('nonexistent', {}, context);

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(ToolNotFoundError);
  });

  it('应该验证输入参数 Schema', async () => {
    registry.register({
      meta: {
        id: 'greet',
        name: '问候工具',
        mode: ToolMode.SYNC,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
      },
      executor: {
        execute: async (params: unknown) => {
          const { name } = params as { name: string };
          return `Hello, ${name}!`;
        },
      },
    });

    // 有效参数
    const validResult = await invoker.invoke('greet', { name: 'Alice' }, context);
    expect(validResult.success).toBe(true);
    expect(validResult.result).toBe('Hello, Alice!');

    // 无效参数（缺少必需字段）
    const invalidResult = await invoker.invoke('greet', {}, context);
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toBeInstanceOf(SchemaValidationError);
  });

  it('应该处理工具执行错误', async () => {
    registry.register({
      meta: {
        id: 'failing',
        name: '失败工具',
        mode: ToolMode.SYNC,
      },
      executor: {
        execute: async () => {
          throw new Error('工具执行失败');
        },
      },
    });

    const result = await invoker.invoke('failing', {}, context);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('工具执行失败');
  });

  it('应该支持超时控制', async () => {
    registry.register({
      meta: {
        id: 'slow',
        name: '慢速工具',
        mode: ToolMode.SYNC,
        timeout: 50, // 50ms 超时
      },
      executor: {
        execute: async () => {
          // 模拟耗时操作
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'done';
        },
      },
    });

    const result = await invoker.invoke('slow', {}, context);

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(TimeoutError);
  });

  it('应该发出工具调用事件', async () => {
    const events: unknown[] = [];
    eventEmitter.on(EventType.TOOL_INVOKE, (e) => events.push(e));
    eventEmitter.on(EventType.TOOL_COMPLETE, (e) => events.push(e));

    registry.register({
      meta: {
        id: 'echo',
        name: '回显工具',
        mode: ToolMode.SYNC,
      },
      executor: {
        execute: async (params: unknown) => params,
      },
    });

    await invoker.invoke('echo', { message: 'test' }, context, 'step-1');

    expect(events.length).toBe(2);
    expect((events[0] as { type: EventType }).type).toBe(EventType.TOOL_INVOKE);
    expect((events[1] as { type: EventType }).type).toBe(EventType.TOOL_COMPLETE);
  });
});

describe('异步工具调用', () => {
  let registry: ToolRegistry;
  let eventEmitter: EventEmitter;
  let invoker: ToolInvoker;
  let context: Context;

  beforeEach(() => {
    registry = new ToolRegistry();
    eventEmitter = new EventEmitter();
    invoker = new ToolInvoker(registry, eventEmitter, 'workflow-1', 'instance-1');
    context = new Context('workflow-1', 'instance-1');
  });

  it('应该等待外部响应', async () => {
    registry.register({
      meta: {
        id: 'async-tool',
        name: '异步工具',
        mode: ToolMode.ASYNC,
      },
      executor: {
        execute: async () => {
          // 异步工具的执行器不会被直接调用
          return null;
        },
      },
    });

    // 启动异步调用
    const resultPromise = invoker.invoke('async-tool', { data: 'test' }, context, 'step-1');

    // 检查是否有等待中的调用
    expect(invoker.hasPendingCalls('step-1')).toBe(true);
    expect(invoker.getPendingCallCount()).toBe(1);

    // 模拟外部响应
    setTimeout(() => {
      invoker.respondToTool('step-1', 'async-tool', { result: 'success' });
    }, 10);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ result: 'success' });
    expect(invoker.hasPendingCalls('step-1')).toBe(false);
  });

  it('应该处理异步工具超时', async () => {
    registry.register({
      meta: {
        id: 'async-timeout',
        name: '超时异步工具',
        mode: ToolMode.ASYNC,
        timeout: 50,
      },
      executor: {
        execute: async () => null,
      },
    });

    const result = await invoker.invoke('async-timeout', {}, context, 'step-1');

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(TimeoutError);
  });

  it('应该支持取消等待中的调用', async () => {
    registry.register({
      meta: {
        id: 'cancellable',
        name: '可取消工具',
        mode: ToolMode.ASYNC,
      },
      executor: {
        execute: async () => null,
      },
    });

    // 启动异步调用
    const resultPromise = invoker.invoke('cancellable', {}, context, 'step-1');

    // 取消调用
    invoker.cancelPendingCalls('step-1');

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('已取消');
  });

  it('应该支持响应错误', async () => {
    registry.register({
      meta: {
        id: 'error-tool',
        name: '错误工具',
        mode: ToolMode.ASYNC,
      },
      executor: {
        execute: async () => null,
      },
    });

    const resultPromise = invoker.invoke('error-tool', {}, context, 'step-1');

    setTimeout(() => {
      invoker.respondToToolError('step-1', 'error-tool', new Error('外部错误'));
    }, 10);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('外部错误');
  });
});

describe('批量工具调用', () => {
  let registry: ToolRegistry;
  let eventEmitter: EventEmitter;
  let invoker: ToolInvoker;
  let context: Context;

  beforeEach(() => {
    registry = new ToolRegistry();
    eventEmitter = new EventEmitter();
    invoker = new ToolInvoker(registry, eventEmitter, 'workflow-1', 'instance-1');
    context = new Context('workflow-1', 'instance-1');

    // 注册测试工具
    registry.register({
      meta: { id: 'tool-a', name: '工具A', mode: ToolMode.SYNC },
      executor: { execute: async () => 'result-a' },
    });
    registry.register({
      meta: { id: 'tool-b', name: '工具B', mode: ToolMode.SYNC },
      executor: { execute: async () => 'result-b' },
    });
  });

  it('应该按顺序执行多个工具', async () => {
    const results = await executeToolInvocations(
      invoker,
      [
        { toolId: 'tool-a' },
        { toolId: 'tool-b' },
      ],
      context,
      'step-1'
    );

    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[0].result).toBe('result-a');
    expect(results[1].success).toBe(true);
    expect(results[1].result).toBe('result-b');
  });

  it('应该在工具失败时停止后续调用', async () => {
    registry.register({
      meta: { id: 'failing', name: '失败工具', mode: ToolMode.SYNC },
      executor: { execute: async () => { throw new Error('失败'); } },
    });

    const results = await executeToolInvocations(
      invoker,
      [
        { toolId: 'tool-a' },
        { toolId: 'failing' },
        { toolId: 'tool-b' },
      ],
      context,
      'step-1'
    );

    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
  });

  it('应该将结果存储到上下文', async () => {
    await executeToolInvocations(
      invoker,
      [
        { toolId: 'tool-a', outputKey: 'resultA' },
        { toolId: 'tool-b', outputKey: 'resultB' },
      ],
      context,
      'step-1'
    );

    expect(context.getGlobal('resultA')).toBe('result-a');
    expect(context.getGlobal('resultB')).toBe('result-b');
  });
});
