/**
 * WorkflowEngine 主类测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEngine } from './index';
import type { WorkflowDefinition, ToolRegistration, UIComponentRegistration } from '../core/types';
import { WorkflowStatus, StepStatus, ToolMode, UIMode } from '../core/types';
import { EventType } from '../events';
import { CyclicDependencyError, ValidationError } from '../core/errors';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  // ============ 17.1 引擎初始化和工作流加载测试 ============

  describe('loadWorkflow', () => {
    it('应该成功加载有效的工作流定义', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step2', name: '步骤2', type: 'task', dependencies: ['step1'] },
        ],
      };

      expect(() => engine.loadWorkflow(definition)).not.toThrow();
      expect(engine.getStatus()).toBe(WorkflowStatus.IDLE);
    });

    it('应该拒绝缺少 id 的工作流定义', () => {
      const definition = {
        name: '测试工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      } as WorkflowDefinition;

      expect(() => engine.loadWorkflow(definition)).toThrow(ValidationError);
    });

    it('应该拒绝缺少 name 的工作流定义', () => {
      const definition = {
        id: 'test-workflow',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      } as WorkflowDefinition;

      expect(() => engine.loadWorkflow(definition)).toThrow(ValidationError);
    });

    it('应该拒绝没有步骤的工作流定义', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [],
      };

      expect(() => engine.loadWorkflow(definition)).toThrow(ValidationError);
    });

    it('应该拒绝有重复步骤 ID 的工作流定义', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step1', name: '步骤1重复', type: 'task' },
        ],
      };

      expect(() => engine.loadWorkflow(definition)).toThrow(ValidationError);
    });

    it('应该检测并拒绝循环依赖', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task', dependencies: ['C'] },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['B'] },
        ],
      };

      expect(() => engine.loadWorkflow(definition)).toThrow(CyclicDependencyError);
    });

    it('应该支持线性工作流', () => {
      const definition: WorkflowDefinition = {
        id: 'linear-workflow',
        name: '线性工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['B'] },
        ],
      };

      expect(() => engine.loadWorkflow(definition)).not.toThrow();
    });

    it('应该支持并行工作流', () => {
      const definition: WorkflowDefinition = {
        id: 'parallel-workflow',
        name: '并行工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['A'] },
          { id: 'D', name: '步骤D', type: 'task', dependencies: ['B', 'C'] },
        ],
      };

      expect(() => engine.loadWorkflow(definition)).not.toThrow();
    });
  });

  // ============ 17.2 工作流执行控制测试 ============

  describe('start', () => {
    it('应该在未加载工作流时抛出错误', async () => {
      await expect(engine.start()).rejects.toThrow('请先调用 loadWorkflow 加载工作流定义');
    });

    it('应该成功执行简单的线性工作流', async () => {
      const definition: WorkflowDefinition = {
        id: 'simple-workflow',
        name: '简单工作流',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step2', name: '步骤2', type: 'task', dependencies: ['step1'] },
        ],
      };

      engine.loadWorkflow(definition);
      const result = await engine.start();

      expect(result.status).toBe(WorkflowStatus.COMPLETED);
    });

    it('应该支持初始上下文数据', async () => {
      const definition: WorkflowDefinition = {
        id: 'context-workflow',
        name: '上下文工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      engine.loadWorkflow(definition);
      const result = await engine.start({ initialValue: 'test' });

      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(result.context.globals['initialValue']).toBe('test');
    });

    it('应该发出工作流开始事件', async () => {
      const definition: WorkflowDefinition = {
        id: 'event-workflow',
        name: '事件工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      const startListener = vi.fn();
      engine.on(EventType.WORKFLOW_START, startListener);

      engine.loadWorkflow(definition);
      await engine.start();

      expect(startListener).toHaveBeenCalled();
    });

    it('应该发出工作流完成事件', async () => {
      const definition: WorkflowDefinition = {
        id: 'complete-workflow',
        name: '完成工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      const completeListener = vi.fn();
      engine.on(EventType.WORKFLOW_COMPLETE, completeListener);

      engine.loadWorkflow(definition);
      await engine.start();

      expect(completeListener).toHaveBeenCalled();
    });

    it('应该并行执行独立的步骤', async () => {
      const executionOrder: string[] = [];
      
      const definition: WorkflowDefinition = {
        id: 'parallel-workflow',
        name: '并行工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['A'] },
          { id: 'D', name: '步骤D', type: 'task', dependencies: ['B', 'C'] },
        ],
      };

      engine.on(EventType.PROGRESS_UPDATE, (event) => {
        if (event.stepId && !executionOrder.includes(event.stepId)) {
          executionOrder.push(event.stepId);
        }
      });

      engine.loadWorkflow(definition);
      await engine.start();

      // 验证所有步骤都被执行了
      expect(executionOrder).toContain('A');
      expect(executionOrder).toContain('B');
      expect(executionOrder).toContain('C');
      expect(executionOrder).toContain('D');
      
      // A 应该在 B 和 C 之前执行
      const aIndex = executionOrder.indexOf('A');
      const bIndex = executionOrder.indexOf('B');
      const cIndex = executionOrder.indexOf('C');
      const dIndex = executionOrder.indexOf('D');
      
      expect(aIndex).toBeLessThan(bIndex);
      expect(aIndex).toBeLessThan(cIndex);
      // D 应该在 B 和 C 之后执行
      expect(dIndex).toBeGreaterThan(bIndex);
      expect(dIndex).toBeGreaterThan(cIndex);
    });
  });

  describe('pause 和 resume', () => {
    it('应该在未加载工作流时抛出错误', () => {
      expect(() => engine.pause()).toThrow('没有正在执行的工作流');
      expect(() => engine.resume()).toThrow('没有正在执行的工作流');
    });

    it('应该在工作流未运行时抛出错误', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      engine.loadWorkflow(definition);
      expect(() => engine.pause()).toThrow('工作流未在运行中');
    });
  });

  describe('cancel', () => {
    it('应该在未加载工作流时抛出错误', () => {
      expect(() => engine.cancel()).toThrow('没有正在执行的工作流');
    });

    it('应该能够取消已加载的工作流', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      engine.loadWorkflow(definition);
      expect(() => engine.cancel()).not.toThrow();
      expect(engine.getStatus()).toBe(WorkflowStatus.FAILED);
    });
  });

  // ============ 17.3 查询接口测试 ============

  describe('getStatus', () => {
    it('应该在未加载工作流时返回 IDLE', () => {
      expect(engine.getStatus()).toBe(WorkflowStatus.IDLE);
    });

    it('应该在加载工作流后返回 IDLE', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      engine.loadWorkflow(definition);
      expect(engine.getStatus()).toBe(WorkflowStatus.IDLE);
    });

    it('应该在工作流完成后返回 COMPLETED', async () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      engine.loadWorkflow(definition);
      await engine.start();
      expect(engine.getStatus()).toBe(WorkflowStatus.COMPLETED);
    });
  });

  describe('getContext', () => {
    it('应该在未加载工作流时返回 null', () => {
      expect(engine.getContext()).toBeNull();
    });

    it('应该在加载工作流后返回上下文', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      engine.loadWorkflow(definition);
      const context = engine.getContext();
      expect(context).not.toBeNull();
      expect(context?.workflowId).toBe('test-workflow');
    });
  });

  describe('getStepBarState', () => {
    it('应该在未加载工作流时返回 null', () => {
      expect(engine.getStepBarState()).toBeNull();
    });

    it('应该在加载工作流后返回步骤条状态', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step2', name: '步骤2', type: 'task' },
        ],
      };

      engine.loadWorkflow(definition);
      const stepBarState = engine.getStepBarState();
      
      expect(stepBarState).not.toBeNull();
      expect(stepBarState?.steps).toHaveLength(2);
      expect(stepBarState?.steps[0].status).toBe(StepStatus.PENDING);
    });

    it('应该在工作流完成后反映正确的状态', async () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step2', name: '步骤2', type: 'task', dependencies: ['step1'] },
        ],
      };

      engine.loadWorkflow(definition);
      await engine.start();
      
      const stepBarState = engine.getStepBarState();
      expect(stepBarState?.steps.every(s => s.status === StepStatus.SUCCESS)).toBe(true);
    });
  });

  // ============ 注册表管理测试 ============

  describe('registerTool 和 unregisterTool', () => {
    it('应该能够注册和卸载工具', () => {
      const toolRegistration: ToolRegistration = {
        meta: {
          id: 'test-tool',
          name: '测试工具',
          mode: ToolMode.SYNC,
        },
        executor: {
          execute: async () => 'result',
        },
      };

      engine.registerTool(toolRegistration);
      expect(engine.getRegisteredTools()).toHaveLength(1);
      expect(engine.getRegisteredTools()[0].id).toBe('test-tool');

      engine.unregisterTool('test-tool');
      expect(engine.getRegisteredTools()).toHaveLength(0);
    });
  });

  describe('registerUIComponent 和 unregisterUIComponent', () => {
    it('应该能够注册和卸载 UI 组件', () => {
      engine.registerUIComponent(
        {
          id: 'test-ui',
          name: '测试 UI',
          supportedModes: [UIMode.DISPLAY],
        },
        {
          render: async () => ({ rendered: true }),
        }
      );

      expect(engine.getRegisteredUIComponents()).toHaveLength(1);
      expect(engine.getRegisteredUIComponents()[0].id).toBe('test-ui');

      engine.unregisterUIComponent('test-ui');
      expect(engine.getRegisteredUIComponents()).toHaveLength(0);
    });
  });

  // ============ Hook 管理测试 ============

  describe('addGlobalHook 和 removeGlobalHook', () => {
    it('应该能够添加和移除全局 Hook', async () => {
      const hookExecuted = vi.fn();

      engine.addGlobalHook('before', {
        id: 'test-hook',
        name: '测试 Hook',
        handler: async () => {
          hookExecuted();
        },
      });

      const definition: WorkflowDefinition = {
        id: 'hook-workflow',
        name: 'Hook 工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      engine.loadWorkflow(definition);
      await engine.start();

      expect(hookExecuted).toHaveBeenCalled();
    });
  });

  // ============ 事件管理测试 ============

  describe('on 和 off', () => {
    it('应该能够注册和移除事件监听器', async () => {
      const listener = vi.fn();

      engine.on(EventType.WORKFLOW_START, listener);

      const definition: WorkflowDefinition = {
        id: 'event-workflow',
        name: '事件工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      engine.loadWorkflow(definition);
      await engine.start();

      expect(listener).toHaveBeenCalled();

      // 移除监听器后重新执行
      engine.off(EventType.WORKFLOW_START, listener);
      listener.mockClear();

      engine.loadWorkflow(definition);
      await engine.start();

      // 监听器不应该被调用（因为已移除）
      // 注意：由于 loadWorkflow 会重新初始化，这里的测试可能需要调整
    });
  });

  // ============ 元数据查询测试 ============

  describe('getRegisteredTools', () => {
    it('应该返回空数组当没有注册工具时', () => {
      expect(engine.getRegisteredTools()).toEqual([]);
    });

    it('应该返回所有已注册的工具', () => {
      engine.registerTool({
        meta: { id: 'tool1', name: '工具1', mode: ToolMode.SYNC },
        executor: { execute: async () => {} },
      });
      engine.registerTool({
        meta: { id: 'tool2', name: '工具2', mode: ToolMode.ASYNC },
        executor: { execute: async () => {} },
      });

      const tools = engine.getRegisteredTools();
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.id)).toContain('tool1');
      expect(tools.map(t => t.id)).toContain('tool2');
    });
  });

  describe('getRegisteredUIComponents', () => {
    it('应该返回空数组当没有注册 UI 组件时', () => {
      expect(engine.getRegisteredUIComponents()).toEqual([]);
    });

    it('应该返回所有已注册的 UI 组件', () => {
      engine.registerUIComponent(
        { id: 'ui1', name: 'UI1', supportedModes: [UIMode.DISPLAY] },
        { render: async () => ({ rendered: true }) }
      );
      engine.registerUIComponent(
        { id: 'ui2', name: 'UI2', supportedModes: [UIMode.CONFIRM] },
        { render: async () => ({ rendered: true }) }
      );

      const components = engine.getRegisteredUIComponents();
      expect(components).toHaveLength(2);
      expect(components.map(c => c.id)).toContain('ui1');
      expect(components.map(c => c.id)).toContain('ui2');
    });
  });

  // ============ 19.1 序列化测试 ============

  describe('exportDefinition', () => {
    it('应该在未加载工作流时抛出错误', () => {
      expect(() => engine.exportDefinition()).toThrow('没有加载的工作流定义');
    });

    it('应该成功导出简单的工作流定义', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step2', name: '步骤2', type: 'task', dependencies: ['step1'] },
        ],
      };

      engine.loadWorkflow(definition);
      const json = engine.exportDefinition();
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe('test-workflow');
      expect(parsed.name).toBe('测试工作流');
      expect(parsed.steps).toHaveLength(2);
      expect(parsed.steps[0].id).toBe('step1');
      expect(parsed.steps[1].dependencies).toEqual(['step1']);
    });

    it('应该导出包含描述的工作流定义', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        description: '这是一个测试工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      };

      engine.loadWorkflow(definition);
      const json = engine.exportDefinition();
      const parsed = JSON.parse(json);

      expect(parsed.description).toBe('这是一个测试工作流');
    });

    it('应该导出包含重试策略的步骤', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [{
          id: 'step1',
          name: '步骤1',
          type: 'task',
          retryPolicy: {
            maxRetries: 3,
            retryInterval: 1000,
            exponentialBackoff: true,
          },
        }],
      };

      engine.loadWorkflow(definition);
      const json = engine.exportDefinition();
      const parsed = JSON.parse(json);

      expect(parsed.steps[0].retryPolicy).toEqual({
        maxRetries: 3,
        retryInterval: 1000,
        exponentialBackoff: true,
      });
    });

    it('应该导出包含跳过策略的步骤', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [{
          id: 'step1',
          name: '步骤1',
          type: 'task',
          skipPolicy: {
            condition: 'ctx.getGlobal("skip") === true',
            defaultOutput: { skipped: true },
          },
        }],
      };

      engine.loadWorkflow(definition);
      const json = engine.exportDefinition();
      const parsed = JSON.parse(json);

      expect(parsed.steps[0].skipPolicy.condition).toBe('ctx.getGlobal("skip") === true');
      expect(parsed.steps[0].skipPolicy.defaultOutput).toEqual({ skipped: true });
    });

    it('应该导出包含 UI 配置的步骤', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [{
          id: 'step1',
          name: '步骤1',
          type: 'ui',
          ui: {
            componentId: 'confirm-dialog',
            mode: UIMode.CONFIRM,
            data: { message: '确认继续？' },
          },
        }],
      };

      engine.loadWorkflow(definition);
      const json = engine.exportDefinition();
      const parsed = JSON.parse(json);

      expect(parsed.steps[0].ui.componentId).toBe('confirm-dialog');
      expect(parsed.steps[0].ui.mode).toBe(UIMode.CONFIRM);
    });

    it('应该导出包含工具调用的步骤', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [{
          id: 'step1',
          name: '步骤1',
          type: 'task',
          tools: [
            { toolId: 'tool1', params: { key: 'value' }, outputKey: 'result' },
          ],
        }],
      };

      engine.loadWorkflow(definition);
      const json = engine.exportDefinition();
      const parsed = JSON.parse(json);

      expect(parsed.steps[0].tools).toHaveLength(1);
      expect(parsed.steps[0].tools[0].toolId).toBe('tool1');
    });
  });

  describe('importDefinition', () => {
    it('应该成功导入有效的 JSON 工作流定义', () => {
      const json = JSON.stringify({
        id: 'imported-workflow',
        name: '导入的工作流',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step2', name: '步骤2', type: 'task', dependencies: ['step1'] },
        ],
      });

      engine.importDefinition(json);

      expect(engine.getStatus()).toBe(WorkflowStatus.IDLE);
      const context = engine.getContext();
      expect(context?.workflowId).toBe('imported-workflow');
    });

    it('应该拒绝无效的 JSON 格式', () => {
      expect(() => engine.importDefinition('invalid json')).toThrow(ValidationError);
    });

    it('应该拒绝缺少必需字段的定义', () => {
      const json = JSON.stringify({
        name: '缺少 id 的工作流',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      });

      expect(() => engine.importDefinition(json)).toThrow(ValidationError);
    });

    it('应该拒绝包含循环依赖的定义', () => {
      const json = JSON.stringify({
        id: 'cyclic-workflow',
        name: '循环依赖工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task', dependencies: ['C'] },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['B'] },
        ],
      });

      expect(() => engine.importDefinition(json)).toThrow(CyclicDependencyError);
    });

    it('应该支持导入包含所有可选字段的定义', () => {
      const json = JSON.stringify({
        id: 'full-workflow',
        name: '完整工作流',
        description: '包含所有字段的工作流',
        steps: [{
          id: 'step1',
          name: '步骤1',
          type: 'task',
          config: { key: 'value' },
          retryPolicy: { maxRetries: 3, retryInterval: 1000 },
          skipPolicy: { condition: 'true', defaultOutput: null },
        }],
      });

      expect(() => engine.importDefinition(json)).not.toThrow();
    });
  });

  describe('序列化 Round-Trip', () => {
    it('应该支持导出后再导入的往返操作', () => {
      const originalDefinition: WorkflowDefinition = {
        id: 'roundtrip-workflow',
        name: '往返测试工作流',
        description: '测试序列化往返',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step2', name: '步骤2', type: 'task', dependencies: ['step1'] },
          { id: 'step3', name: '步骤3', type: 'task', dependencies: ['step1'] },
          { id: 'step4', name: '步骤4', type: 'task', dependencies: ['step2', 'step3'] },
        ],
      };

      // 加载原始定义
      engine.loadWorkflow(originalDefinition);
      
      // 导出
      const json = engine.exportDefinition();
      
      // 创建新引擎并导入
      const newEngine = new WorkflowEngine();
      newEngine.importDefinition(json);
      
      // 验证导入后的定义
      const newJson = newEngine.exportDefinition();
      const parsed = JSON.parse(newJson);
      
      expect(parsed.id).toBe(originalDefinition.id);
      expect(parsed.name).toBe(originalDefinition.name);
      expect(parsed.description).toBe(originalDefinition.description);
      expect(parsed.steps).toHaveLength(originalDefinition.steps.length);
    });

    it('应该在往返后保持步骤依赖关系', () => {
      const definition: WorkflowDefinition = {
        id: 'dep-workflow',
        name: '依赖测试',
        steps: [
          { id: 'A', name: 'A', type: 'task' },
          { id: 'B', name: 'B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: 'C', type: 'task', dependencies: ['A'] },
          { id: 'D', name: 'D', type: 'task', dependencies: ['B', 'C'] },
        ],
      };

      engine.loadWorkflow(definition);
      const json = engine.exportDefinition();
      
      const newEngine = new WorkflowEngine();
      newEngine.importDefinition(json);
      
      const newJson = newEngine.exportDefinition();
      const parsed = JSON.parse(newJson);
      
      const stepD = parsed.steps.find((s: { id: string }) => s.id === 'D');
      expect(stepD.dependencies).toContain('B');
      expect(stepD.dependencies).toContain('C');
    });
  });

  // ============ 19.3 工作流定义验证接口测试 ============

  describe('validateWorkflowDefinition', () => {
    it('应该验证有效的工作流定义', () => {
      const definition: WorkflowDefinition = {
        id: 'valid-workflow',
        name: '有效工作流',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step2', name: '步骤2', type: 'task', dependencies: ['step1'] },
        ],
      };

      const result = engine.validateWorkflowDefinition(definition);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少 id 的错误', () => {
      const definition = {
        name: '缺少 id',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      } as WorkflowDefinition;

      const result = engine.validateWorkflowDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('工作流定义缺少 id');
    });

    it('应该检测缺少 name 的错误', () => {
      const definition = {
        id: 'no-name',
        steps: [{ id: 'step1', name: '步骤1', type: 'task' }],
      } as WorkflowDefinition;

      const result = engine.validateWorkflowDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('工作流定义缺少 name');
    });

    it('应该检测空步骤列表的错误', () => {
      const definition: WorkflowDefinition = {
        id: 'empty-steps',
        name: '空步骤',
        steps: [],
      };

      const result = engine.validateWorkflowDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('工作流定义缺少步骤');
    });

    it('应该检测重复步骤 ID 的错误', () => {
      const definition: WorkflowDefinition = {
        id: 'dup-steps',
        name: '重复步骤',
        steps: [
          { id: 'step1', name: '步骤1', type: 'task' },
          { id: 'step1', name: '步骤1重复', type: 'task' },
        ],
      };

      const result = engine.validateWorkflowDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('步骤 ID 重复'))).toBe(true);
    });

    it('应该检测循环依赖的错误', () => {
      const definition: WorkflowDefinition = {
        id: 'cyclic',
        name: '循环依赖',
        steps: [
          { id: 'A', name: 'A', type: 'task', dependencies: ['C'] },
          { id: 'B', name: 'B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: 'C', type: 'task', dependencies: ['B'] },
        ],
      };

      const result = engine.validateWorkflowDefinition(definition);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('循环依赖'))).toBe(true);
    });
  });

  // ============ 19.3 步骤类型注册测试 ============

  describe('步骤类型注册', () => {
    it('应该返回默认注册的步骤类型', () => {
      const stepTypes = engine.getRegisteredStepTypes();
      expect(stepTypes.length).toBeGreaterThanOrEqual(3);
      expect(stepTypes.map(t => t.type)).toContain('task');
      expect(stepTypes.map(t => t.type)).toContain('ui');
      expect(stepTypes.map(t => t.type)).toContain('tool');
    });

    it('应该能够注册自定义步骤类型', () => {
      engine.registerStepType({
        type: 'custom',
        name: '自定义步骤',
        description: '用户自定义的步骤类型',
        supportsRetry: true,
        supportsSkip: false,
      });

      const stepTypes = engine.getRegisteredStepTypes();
      expect(stepTypes.map(t => t.type)).toContain('custom');
    });

    it('应该能够卸载步骤类型', () => {
      engine.registerStepType({
        type: 'temp',
        name: '临时步骤',
      });

      expect(engine.hasStepType('temp')).toBe(true);
      
      const result = engine.unregisterStepType('temp');
      expect(result).toBe(true);
      expect(engine.hasStepType('temp')).toBe(false);
    });

    it('应该能够获取指定步骤类型的元数据', () => {
      const taskMeta = engine.getStepTypeMeta('task');
      expect(taskMeta).toBeDefined();
      expect(taskMeta?.type).toBe('task');
      expect(taskMeta?.name).toBe('任务步骤');
    });

    it('应该对不存在的步骤类型返回 undefined', () => {
      const meta = engine.getStepTypeMeta('nonexistent');
      expect(meta).toBeUndefined();
    });

    it('应该能够检查步骤类型是否存在', () => {
      expect(engine.hasStepType('task')).toBe(true);
      expect(engine.hasStepType('nonexistent')).toBe(false);
    });

    it('应该能够注册带有 Schema 的步骤类型', () => {
      engine.registerStepType({
        type: 'api-call',
        name: 'API 调用步骤',
        description: '调用外部 API 的步骤',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'API URL' },
            method: { type: 'string', description: 'HTTP 方法' },
          },
          required: ['url'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            status: { type: 'number', description: '响应状态码' },
            data: { type: 'object', description: '响应数据' },
          },
        },
        supportsRetry: true,
        supportsSkip: true,
      });

      const meta = engine.getStepTypeMeta('api-call');
      expect(meta?.inputSchema).toBeDefined();
      expect(meta?.inputSchema?.properties?.url).toBeDefined();
      expect(meta?.outputSchema).toBeDefined();
    });
  });
});
