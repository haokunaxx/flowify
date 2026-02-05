/**
 * 调度器模块
 * 负责 DAG 解析、拓扑排序、步骤调度
 */

import type { WorkflowDefinition, StepDefinition } from '@flowify/core';
import { CyclicDependencyError, ValidationError } from '@flowify/core';

// ============ DAG 相关类型 ============

/**
 * DAG 节点
 */
export interface DAGNode {
  /** 步骤定义 */
  step: StepDefinition;
  /** 入度（依赖数量） */
  inDegree: number;
  /** 出度（被依赖数量） */
  outDegree: number;
}

/**
 * DAG 结构
 */
export interface DAG {
  /** 节点映射：stepId -> DAGNode */
  nodes: Map<string, DAGNode>;
  /** 边映射：stepId -> 依赖的 stepId 列表 */
  edges: Map<string, string[]>;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息列表 */
  errors?: string[];
}

// ============ DAGBuilder 类 ============

/**
 * DAG 构建器
 * 从工作流定义构建 DAG 结构
 */
export class DAGBuilder {
  /**
   * 从工作流定义构建 DAG
   * 时间复杂度: O(V + E)，V 为步骤数，E 为依赖边数
   * @param definition 工作流定义
   * @returns DAG 结构
   */
  build(definition: WorkflowDefinition): DAG {
    const nodes = new Map<string, DAGNode>();
    const edges = new Map<string, string[]>();

    // 1. 创建所有节点
    for (const step of definition.steps) {
      nodes.set(step.id, {
        step,
        inDegree: 0,
        outDegree: 0,
      });
      edges.set(step.id, step.dependencies || []);
    }

    // 2. 计算入度和出度
    for (const step of definition.steps) {
      const deps = step.dependencies || [];
      const node = nodes.get(step.id)!;
      node.inDegree = deps.length;

      // 更新被依赖节点的出度
      for (const depId of deps) {
        const depNode = nodes.get(depId);
        if (depNode) {
          depNode.outDegree++;
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 检测循环依赖（使用 Kahn 算法）
   * @param dag DAG 结构
   * @returns 如果存在循环，返回循环路径；否则返回 null
   */
  detectCycle(dag: DAG): string[] | null {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const sorted: string[] = [];

    // 初始化入度
    for (const [id, node] of dag.nodes) {
      inDegree.set(id, node.inDegree);
      if (node.inDegree === 0) {
        queue.push(id);
      }
    }

    // Kahn 算法
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      // 找到所有依赖 current 的节点（即 current 是它们的前置依赖）
      for (const [id, deps] of dag.edges) {
        if (deps.includes(current)) {
          const newDegree = inDegree.get(id)! - 1;
          inDegree.set(id, newDegree);
          if (newDegree === 0) {
            queue.push(id);
          }
        }
      }
    }

    // 如果排序结果不包含所有节点，说明存在循环
    if (sorted.length !== dag.nodes.size) {
      return this.findCyclePath(dag, sorted);
    }

    return null;
  }

  /**
   * 获取当前可执行的步骤（依赖已完成的步骤）
   * @param dag DAG 结构
   * @param completedSteps 已完成的步骤 ID 集合
   * @returns 可执行的步骤列表
   */
  getReadySteps(dag: DAG, completedSteps: Set<string>): StepDefinition[] {
    const ready: StepDefinition[] = [];

    for (const [id, node] of dag.nodes) {
      // 跳过已完成的步骤
      if (completedSteps.has(id)) continue;

      const deps = dag.edges.get(id) || [];
      const allDepsCompleted = deps.every((depId) => completedSteps.has(depId));

      if (allDepsCompleted) {
        ready.push(node.step);
      }
    }

    return ready;
  }

  /**
   * 查找循环路径
   * @param dag DAG 结构
   * @param sorted 已排序的节点（不在循环中的节点）
   * @returns 循环路径
   */
  private findCyclePath(dag: DAG, sorted: string[]): string[] {
    // 找出未被排序的节点（这些节点在循环中）
    const inCycle = new Set<string>();
    for (const id of dag.nodes.keys()) {
      if (!sorted.includes(id)) {
        inCycle.add(id);
      }
    }

    // 如果没有循环节点，返回空数组
    if (inCycle.size === 0) {
      return [];
    }

    // 从循环中的任意节点开始，使用 DFS 追踪循环路径
    const start = inCycle.values().next().value as string;
    return this.findCycleFromNode(dag, start, inCycle);
  }

  /**
   * 从指定节点开始查找循环路径
   * @param dag DAG 结构
   * @param start 起始节点
   * @param inCycle 在循环中的节点集合
   * @returns 循环路径
   */
  private findCycleFromNode(
    dag: DAG,
    start: string,
    inCycle: Set<string>
  ): string[] {
    const path: string[] = [start];
    const visited = new Set<string>([start]);

    let current = start;
    while (true) {
      const deps = dag.edges.get(current) || [];
      // 找到下一个在循环中且未访问的依赖节点
      const nextInCycle = deps.find((d) => inCycle.has(d) && !visited.has(d));

      if (!nextInCycle) {
        // 检查是否可以回到起点形成循环
        const backToStart = deps.find((d) => d === start);
        if (backToStart) {
          path.push(start);
        } else {
          // 尝试找到任何已访问的节点形成循环
          const backToVisited = deps.find((d) => visited.has(d));
          if (backToVisited) {
            path.push(backToVisited);
          }
        }
        break;
      }

      path.push(nextInCycle);
      visited.add(nextInCycle);
      current = nextInCycle;
    }

    return path;
  }
}

// ============ Scheduler 类 ============

/**
 * 调度器
 * 负责解析工作流定义、验证 DAG、调度步骤执行
 */
export class Scheduler {
  private dagBuilder: DAGBuilder;

  constructor() {
    this.dagBuilder = new DAGBuilder();
  }

  /**
   * 解析工作流定义，构建 DAG
   * @param definition 工作流定义
   * @returns DAG 结构
   */
  parse(definition: WorkflowDefinition): DAG {
    return this.dagBuilder.build(definition);
  }

  /**
   * 验证 DAG 无循环依赖
   * @param dag DAG 结构
   * @returns 验证结果
   * @throws CyclicDependencyError 如果存在循环依赖
   */
  validate(dag: DAG): ValidationResult {
    const errors: string[] = [];

    // 检查空工作流
    if (dag.nodes.size === 0) {
      errors.push('工作流定义不能为空');
      return { valid: false, errors };
    }

    // 检查依赖的步骤是否存在
    for (const [stepId, deps] of dag.edges) {
      for (const depId of deps) {
        if (!dag.nodes.has(depId)) {
          errors.push(`步骤 "${stepId}" 依赖的步骤 "${depId}" 不存在`);
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // 检测循环依赖
    const cyclePath = this.dagBuilder.detectCycle(dag);
    if (cyclePath) {
      throw new CyclicDependencyError(cyclePath);
    }

    return { valid: true };
  }

  /**
   * 获取下一批可执行的步骤
   * @param dag DAG 结构
   * @param completedSteps 已完成的步骤 ID 集合
   * @returns 可执行的步骤列表
   */
  getReadySteps(dag: DAG, completedSteps: Set<string>): StepDefinition[] {
    return this.dagBuilder.getReadySteps(dag, completedSteps);
  }

  /**
   * 获取拓扑排序结果
   * @param dag DAG 结构
   * @returns 拓扑排序后的步骤 ID 列表
   * @throws CyclicDependencyError 如果存在循环依赖
   */
  topologicalSort(dag: DAG): string[] {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const sorted: string[] = [];

    // 初始化入度
    for (const [id, node] of dag.nodes) {
      inDegree.set(id, node.inDegree);
      if (node.inDegree === 0) {
        queue.push(id);
      }
    }

    // Kahn 算法进行拓扑排序
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      // 找到所有依赖 current 的节点
      for (const [id, deps] of dag.edges) {
        if (deps.includes(current)) {
          const newDegree = inDegree.get(id)! - 1;
          inDegree.set(id, newDegree);
          if (newDegree === 0) {
            queue.push(id);
          }
        }
      }
    }

    // 如果排序结果不包含所有节点，说明存在循环
    if (sorted.length !== dag.nodes.size) {
      const cyclePath = this.dagBuilder.detectCycle(dag);
      throw new CyclicDependencyError(cyclePath || []);
    }

    return sorted;
  }
}
