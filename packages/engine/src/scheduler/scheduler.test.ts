/**
 * 调度器模块单元测试
 */

import { describe, it, expect } from 'vitest';
import { DAGBuilder, Scheduler } from './index';
import type { WorkflowDefinition } from '@flowify/core';
import { CyclicDependencyError } from '@flowify/core';

describe('DAGBuilder', () => {
  const builder = new DAGBuilder();

  describe('build', () => {
    it('应该正确构建线性工作流的 DAG', () => {
      // A → B → C
      const definition: WorkflowDefinition = {
        id: 'linear-workflow',
        name: '线性工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['B'] },
        ],
      };

      const dag = builder.build(definition);

      expect(dag.nodes.size).toBe(3);
      expect(dag.nodes.get('A')?.inDegree).toBe(0);
      expect(dag.nodes.get('A')?.outDegree).toBe(1);
      expect(dag.nodes.get('B')?.inDegree).toBe(1);
      expect(dag.nodes.get('B')?.outDegree).toBe(1);
      expect(dag.nodes.get('C')?.inDegree).toBe(1);
      expect(dag.nodes.get('C')?.outDegree).toBe(0);
    });

    it('应该正确构建并行工作流的 DAG', () => {
      //     ┌→ B ─┐
      // A ──┤     ├→ D
      //     └→ C ─┘
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

      const dag = builder.build(definition);

      expect(dag.nodes.size).toBe(4);
      expect(dag.nodes.get('A')?.inDegree).toBe(0);
      expect(dag.nodes.get('A')?.outDegree).toBe(2);
      expect(dag.nodes.get('B')?.inDegree).toBe(1);
      expect(dag.nodes.get('C')?.inDegree).toBe(1);
      expect(dag.nodes.get('D')?.inDegree).toBe(2);
      expect(dag.nodes.get('D')?.outDegree).toBe(0);
    });
  });

  describe('detectCycle', () => {
    it('应该检测到简单循环依赖', () => {
      // A → B → C → A (循环)
      const definition: WorkflowDefinition = {
        id: 'cyclic-workflow',
        name: '循环工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task', dependencies: ['C'] },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['B'] },
        ],
      };

      const dag = builder.build(definition);
      const cyclePath = builder.detectCycle(dag);

      expect(cyclePath).not.toBeNull();
      expect(cyclePath!.length).toBeGreaterThan(1);
    });

    it('应该对无循环的 DAG 返回 null', () => {
      const definition: WorkflowDefinition = {
        id: 'acyclic-workflow',
        name: '无循环工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['A'] },
        ],
      };

      const dag = builder.build(definition);
      const cyclePath = builder.detectCycle(dag);

      expect(cyclePath).toBeNull();
    });
  });

  describe('getReadySteps', () => {
    it('应该返回所有入度为 0 的步骤作为初始可执行步骤', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task' },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['A', 'B'] },
        ],
      };

      const dag = builder.build(definition);
      const readySteps = builder.getReadySteps(dag, new Set());

      expect(readySteps.length).toBe(2);
      expect(readySteps.map((s) => s.id).sort()).toEqual(['A', 'B']);
    });

    it('应该在依赖完成后返回后续步骤', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
        ],
      };

      const dag = builder.build(definition);
      const completedSteps = new Set(['A']);
      const readySteps = builder.getReadySteps(dag, completedSteps);

      expect(readySteps.length).toBe(1);
      expect(readySteps[0].id).toBe('B');
    });

    it('应该在部分依赖完成时不返回步骤', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task' },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['A', 'B'] },
        ],
      };

      const dag = builder.build(definition);
      const completedSteps = new Set(['A']); // 只完成了 A，B 还没完成
      const readySteps = builder.getReadySteps(dag, completedSteps);

      // C 不应该在可执行列表中，因为 B 还没完成
      expect(readySteps.map((s) => s.id)).not.toContain('C');
      // B 应该在可执行列表中
      expect(readySteps.map((s) => s.id)).toContain('B');
    });
  });
});

describe('Scheduler', () => {
  const scheduler = new Scheduler();

  describe('parse', () => {
    it('应该正确解析工作流定义', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
        ],
      };

      const dag = scheduler.parse(definition);

      expect(dag.nodes.size).toBe(2);
      expect(dag.edges.get('B')).toEqual(['A']);
    });
  });

  describe('validate', () => {
    it('应该验证有效的 DAG', () => {
      const definition: WorkflowDefinition = {
        id: 'valid-workflow',
        name: '有效工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
        ],
      };

      const dag = scheduler.parse(definition);
      const result = scheduler.validate(dag);

      expect(result.valid).toBe(true);
    });

    it('应该对循环依赖抛出 CyclicDependencyError', () => {
      const definition: WorkflowDefinition = {
        id: 'cyclic-workflow',
        name: '循环工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task', dependencies: ['B'] },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
        ],
      };

      const dag = scheduler.parse(definition);

      expect(() => scheduler.validate(dag)).toThrow(CyclicDependencyError);
    });

    it('应该检测不存在的依赖步骤', () => {
      const definition: WorkflowDefinition = {
        id: 'invalid-workflow',
        name: '无效工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task', dependencies: ['X'] }, // X 不存在
        ],
      };

      const dag = scheduler.parse(definition);
      const result = scheduler.validate(dag);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('步骤 "A" 依赖的步骤 "X" 不存在');
    });
  });

  describe('topologicalSort', () => {
    it('应该返回正确的拓扑排序结果', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['A'] },
          { id: 'D', name: '步骤D', type: 'task', dependencies: ['B', 'C'] },
        ],
      };

      const dag = scheduler.parse(definition);
      const sorted = scheduler.topologicalSort(dag);

      // A 应该在 B 和 C 之前
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'));
      // B 和 C 应该在 D 之前
      expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('D'));
      expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'));
    });

    it('应该对循环依赖抛出 CyclicDependencyError', () => {
      const definition: WorkflowDefinition = {
        id: 'cyclic-workflow',
        name: '循环工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task', dependencies: ['C'] },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['B'] },
        ],
      };

      const dag = scheduler.parse(definition);

      expect(() => scheduler.topologicalSort(dag)).toThrow(CyclicDependencyError);
    });
  });

  describe('getReadySteps', () => {
    it('应该正确返回可执行步骤', () => {
      const definition: WorkflowDefinition = {
        id: 'test-workflow',
        name: '测试工作流',
        steps: [
          { id: 'A', name: '步骤A', type: 'task' },
          { id: 'B', name: '步骤B', type: 'task', dependencies: ['A'] },
          { id: 'C', name: '步骤C', type: 'task', dependencies: ['A'] },
          { id: 'D', name: '步骤D', type: 'task', dependencies: ['B', 'C'] },
        ],
      };

      const dag = scheduler.parse(definition);

      // 初始状态：只有 A 可执行
      let readySteps = scheduler.getReadySteps(dag, new Set());
      expect(readySteps.map((s) => s.id)).toEqual(['A']);

      // A 完成后：B 和 C 可执行
      readySteps = scheduler.getReadySteps(dag, new Set(['A']));
      expect(readySteps.map((s) => s.id).sort()).toEqual(['B', 'C']);

      // A、B 完成后：只有 C 可执行（D 还需要等 C）
      readySteps = scheduler.getReadySteps(dag, new Set(['A', 'B']));
      expect(readySteps.map((s) => s.id)).toEqual(['C']);

      // A、B、C 完成后：D 可执行
      readySteps = scheduler.getReadySteps(dag, new Set(['A', 'B', 'C']));
      expect(readySteps.map((s) => s.id)).toEqual(['D']);
    });
  });
});
