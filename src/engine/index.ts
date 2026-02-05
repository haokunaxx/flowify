/**
 * 工作流引擎主类模块
 * 协调各组件工作，提供统一的工作流执行接口
 * 
 * Requirements: 1.1, 2.1, 2.2, 2.3, 5.6, 12.4, 12.5, 12.6, 12.7, 12.8, 13.6
 */

import type {
  WorkflowDefinition,
  StepDefinition,
  ToolRegistration,
  UIComponentMeta,
  UIRenderer,
  UIComponentRegistration,
  HookHandler,
  ToolMeta,
  ContextSnapshot,
  UIRenderResult,
  RetryPolicy,
  SkipPolicy,
  SkipConditionFn,
  HookDefinition,
  UIConfig,
  ToolInvocation,
  HookFn,
  JSONSchema,
} from '../core/types';
import type { Context as IContext } from '../core/types';
import { WorkflowStatus, StepStatus, WaitType } from '../core/types';
import { ValidationError, CyclicDependencyError } from '../core/errors';
import { Scheduler, DAG } from '../scheduler';
import { Executor, StepResult, StepExecuteFn, createDependencyInput } from '../executor';
import { Context } from '../context';
import { EventEmitter, EventType, createWorkflowEvent, StepBarPayload, EventListener } from '../events';
import { ToolRegistry, UIRegistry } from '../registry';
import { HookManager } from '../hooks';
import { ProgressManager } from '../progress';
import { WaitManager } from '../async';
import { ToolInvoker, executeToolInvocations } from '../tools';
import { UIInteractionHandler } from '../ui';

// ============ 步骤类型元数据 ============

/**
 * 步骤类型元数据
 * 描述一种步骤类型的基本信息和输入输出规格
 * 
 * Requirements: 12.4, 12.8
 */
export interface StepTypeMeta {
  /** 步骤类型唯一标识 */
  type: string;
  /** 步骤类型名称 */
  name: string;
  /** 步骤类型描述 */
  description?: string;
  /** 输入参数 Schema */
  inputSchema?: JSONSchema;
  /** 输出结果 Schema */
  outputSchema?: JSONSchema;
  /** 是否支持重试 */
  supportsRetry?: boolean;
  /** 是否支持跳过 */
  supportsSkip?: boolean;
}

// ============ 工作流实例状态 ============

/**
 * 工作流实例状态
 */
export interface WorkflowInstance {
  /** 实例 ID */
  id: string;
  /** 工作流定义 ID */
  workflowId: string;
  /** 工作流状态 */
  status: WorkflowStatus;
  /** 工作流定义 */
  definition: WorkflowDefinition;
  /** DAG 结构 */
  dag: DAG;
  /** 执行上下文 */
  context: Context;
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
}

/**
 * 工作流执行结果
 */
export interface WorkflowResult {
  /** 执行状态 */
  status: WorkflowStatus;
  /** 上下文快照 */
  context: ContextSnapshot;
  /** 错误信息（如果失败） */
  error?: Error;
}

// ============ 工作流引擎主类 ============

/**
 * 工作流引擎主类
 * 协调 Scheduler、Executor、Context、EventEmitter 等组件工作
 */
export class WorkflowEngine {
  // ============ 核心组件 ============
  
  /** 调度器 */
  private scheduler: Scheduler;
  
  /** 事件发射器 */
  private eventEmitter: EventEmitter;
  
  /** 工具注册表 */
  private toolRegistry: ToolRegistry;
  
  /** UI 组件注册表 */
  private uiRegistry: UIRegistry;
  
  /** Hook 管理器 */
  private hookManager: HookManager;
  
  /** 步骤类型注册表 */
  private stepTypeRegistry: Map<string, StepTypeMeta> = new Map();
  
  // ============ 运行时组件（每个实例独立） ============
  
  /** 当前工作流实例 */
  private instance: WorkflowInstance | null = null;
  
  /** 执行器 */
  private executor: Executor | null = null;
  
  /** 进度管理器 */
  private progressManager: ProgressManager | null = null;
  
  /** 等待管理器 */
  private waitManager: WaitManager | null = null;
  
  /** 工具调用器 */
  private toolInvoker: ToolInvoker | null = null;
  
  /** UI 交互处理器 */
  private uiHandler: UIInteractionHandler | null = null;
  
  // ============ 执行控制 ============
  
  /** 已完成的步骤 ID 集合 */
  private completedSteps: Set<string> = new Set();
  
  /** 失败的步骤 ID 集合 */
  private failedSteps: Set<string> = new Set();
  
  /** 实例 ID 计数器 */
  private instanceCounter: number = 0;

  /**
   * 创建工作流引擎实例
   */
  constructor() {
    this.scheduler = new Scheduler();
    this.eventEmitter = new EventEmitter();
    this.toolRegistry = new ToolRegistry();
    this.uiRegistry = new UIRegistry();
    this.hookManager = new HookManager();
    
    // 注册默认步骤类型
    this.registerDefaultStepTypes();
  }

  /**
   * 注册默认步骤类型
   * 提供内置的步骤类型定义
   */
  private registerDefaultStepTypes(): void {
    // 任务步骤类型
    this.registerStepType({
      type: 'task',
      name: '任务步骤',
      description: '执行通用任务的步骤',
      supportsRetry: true,
      supportsSkip: true,
    });
    
    // UI 步骤类型
    this.registerStepType({
      type: 'ui',
      name: 'UI 交互步骤',
      description: '需要用户交互的步骤',
      supportsRetry: false,
      supportsSkip: true,
    });
    
    // 工具调用步骤类型
    this.registerStepType({
      type: 'tool',
      name: '工具调用步骤',
      description: '调用外部工具的步骤',
      supportsRetry: true,
      supportsSkip: true,
    });
  }

  // ============ 工作流管理 ============

  /**
   * 加载工作流定义
   * 解析工作流定义，构建 DAG，验证无循环依赖
   * 
   * Requirements: 1.1
   * 
   * @param definition 工作流定义
   * @throws ValidationError 如果工作流定义无效
   * @throws CyclicDependencyError 如果存在循环依赖
   */
  loadWorkflow(definition: WorkflowDefinition): void {
    // 1. 验证工作流定义基本结构
    this.validateDefinition(definition);
    
    // 2. 解析工作流定义，构建 DAG
    const dag = this.scheduler.parse(definition);
    
    // 3. 验证 DAG（检测循环依赖）
    this.scheduler.validate(dag);
    
    // 4. 生成实例 ID
    const instanceId = this.generateInstanceId(definition.id);
    
    // 5. 创建执行上下文
    const context = new Context(definition.id, instanceId);
    
    // 6. 创建工作流实例
    this.instance = {
      id: instanceId,
      workflowId: definition.id,
      status: WorkflowStatus.IDLE,
      definition,
      dag,
      context,
    };
    
    // 7. 初始化运行时组件
    this.initializeRuntimeComponents(definition.id, instanceId, context);
    
    // 8. 初始化进度管理器
    this.progressManager!.initialize(definition);
    
    // 9. 注册全局 Hook（如果有）
    if (definition.globalHooks) {
      if (definition.globalHooks.beforeHooks) {
        for (const hook of definition.globalHooks.beforeHooks) {
          this.hookManager.addGlobalBeforeHook(hook);
        }
      }
      if (definition.globalHooks.afterHooks) {
        for (const hook of definition.globalHooks.afterHooks) {
          this.hookManager.addGlobalAfterHook(hook);
        }
      }
    }
    
    // 10. 重置执行状态
    this.completedSteps.clear();
    this.failedSteps.clear();
  }

  /**
   * 验证工作流定义基本结构
   * @param definition 工作流定义
   */
  private validateDefinition(definition: WorkflowDefinition): void {
    const errors: string[] = [];
    
    if (!definition.id) {
      errors.push('工作流定义缺少 id');
    }
    
    if (!definition.name) {
      errors.push('工作流定义缺少 name');
    }
    
    if (!definition.steps || definition.steps.length === 0) {
      errors.push('工作流定义缺少步骤');
    }
    
    // 检查步骤 ID 唯一性
    const stepIds = new Set<string>();
    for (const step of definition.steps || []) {
      if (!step.id) {
        errors.push('步骤缺少 id');
      } else if (stepIds.has(step.id)) {
        errors.push(`步骤 ID 重复: ${step.id}`);
      } else {
        stepIds.add(step.id);
      }
      
      if (!step.name) {
        errors.push(`步骤 ${step.id} 缺少 name`);
      }
      
      if (!step.type) {
        errors.push(`步骤 ${step.id} 缺少 type`);
      }
    }
    
    if (errors.length > 0) {
      throw new ValidationError('工作流定义验证失败', errors);
    }
  }

  /**
   * 初始化运行时组件
   * @param workflowId 工作流 ID
   * @param instanceId 实例 ID
   * @param context 执行上下文
   */
  private initializeRuntimeComponents(
    workflowId: string,
    instanceId: string,
    context: Context
  ): void {
    // 创建执行器
    this.executor = new Executor(
      this.hookManager,
      this.eventEmitter,
      workflowId,
      instanceId
    );
    
    // 创建进度管理器
    this.progressManager = new ProgressManager(
      this.eventEmitter,
      workflowId,
      instanceId
    );
    
    // 创建等待管理器
    this.waitManager = new WaitManager(
      this.eventEmitter,
      workflowId,
      instanceId
    );
    
    // 创建工具调用器
    this.toolInvoker = new ToolInvoker(
      this.toolRegistry,
      this.eventEmitter,
      workflowId,
      instanceId
    );
    
    // 创建 UI 交互处理器
    this.uiHandler = new UIInteractionHandler(
      this.uiRegistry,
      this.eventEmitter,
      workflowId,
      instanceId
    );
  }

  /**
   * 生成实例 ID
   * @param workflowId 工作流 ID
   * @returns 实例 ID
   */
  private generateInstanceId(workflowId: string): string {
    this.instanceCounter++;
    return `${workflowId}_${Date.now()}_${this.instanceCounter}`;
  }

  // ============ 工作流执行控制 ============

  /**
   * 启动工作流执行
   * 
   * Requirements: 2.1, 2.2, 2.3
   * 
   * @param initialContext 初始上下文数据（可选）
   * @returns 工作流执行结果
   */
  async start(initialContext?: Record<string, unknown>): Promise<WorkflowResult> {
    // 检查是否已加载工作流
    if (!this.instance) {
      throw new Error('请先调用 loadWorkflow 加载工作流定义');
    }
    
    // 检查工作流状态
    if (this.instance.status === WorkflowStatus.RUNNING) {
      throw new Error('工作流正在执行中');
    }
    
    // 设置初始上下文
    if (initialContext) {
      for (const [key, value] of Object.entries(initialContext)) {
        this.instance.context.setGlobal(key, value);
      }
    }
    
    // 更新状态为运行中
    this.instance.status = WorkflowStatus.RUNNING;
    this.instance.startTime = Date.now();
    
    // 发出工作流开始事件
    this.progressManager!.emitWorkflowStart();
    
    try {
      // 执行主循环
      await this.executeMainLoop();
      
      // 检查是否有失败的步骤
      if (this.failedSteps.size > 0) {
        this.instance.status = WorkflowStatus.FAILED;
        this.instance.endTime = Date.now();
        
        const failedStepIds = Array.from(this.failedSteps);
        const error = new Error(`工作流执行失败，失败的步骤: ${failedStepIds.join(', ')}`);
        
        this.progressManager!.emitWorkflowFailed(error, failedStepIds[0]);
        
        return {
          status: WorkflowStatus.FAILED,
          context: this.instance.context.snapshot(),
          error,
        };
      }
      
      // 工作流成功完成
      this.instance.status = WorkflowStatus.COMPLETED;
      this.instance.endTime = Date.now();
      
      this.progressManager!.emitWorkflowComplete();
      
      return {
        status: WorkflowStatus.COMPLETED,
        context: this.instance.context.snapshot(),
      };
    } catch (error) {
      // 工作流执行异常
      this.instance.status = WorkflowStatus.FAILED;
      this.instance.endTime = Date.now();
      
      const workflowError = error instanceof Error ? error : new Error(String(error));
      this.progressManager!.emitWorkflowFailed(workflowError);
      
      return {
        status: WorkflowStatus.FAILED,
        context: this.instance.context.snapshot(),
        error: workflowError,
      };
    }
  }

  /**
   * 主执行循环
   * 按照 DAG 拓扑顺序调度和执行步骤
   */
  private async executeMainLoop(): Promise<void> {
    const { dag, context } = this.instance!;
    
    while (true) {
      // 检查工作流状态
      if (this.instance!.status === WorkflowStatus.PAUSED) {
        // 暂停状态，等待恢复
        await this.waitForResume();
        continue;
      }
      
      if (this.instance!.status !== WorkflowStatus.RUNNING) {
        // 非运行状态，退出循环
        break;
      }
      
      // 获取当前可执行的步骤
      const readySteps = this.scheduler.getReadySteps(dag, this.completedSteps);
      
      // 如果没有可执行的步骤，检查是否完成
      if (readySteps.length === 0) {
        // 检查是否所有步骤都已完成
        if (this.completedSteps.size === dag.nodes.size) {
          break;
        }
        
        // 检查是否有失败的步骤阻塞了后续步骤
        if (this.failedSteps.size > 0) {
          break;
        }
        
        // 可能有步骤在等待中，等待一段时间后重试
        await this.delay(100);
        continue;
      }
      
      // 并行执行所有可执行的步骤
      await this.executeStepsInParallel(readySteps, context);
    }
  }

  /**
   * 并行执行多个步骤
   * @param steps 步骤列表
   * @param context 执行上下文
   */
  private async executeStepsInParallel(
    steps: StepDefinition[],
    context: Context
  ): Promise<void> {
    const promises = steps.map((step) => this.executeStep(step, context));
    await Promise.all(promises);
  }

  /**
   * 执行单个步骤
   * @param step 步骤定义
   * @param context 执行上下文
   */
  private async executeStep(
    step: StepDefinition,
    context: Context
  ): Promise<void> {
    const { id: stepId } = step;
    
    // 更新步骤状态为运行中
    this.progressManager!.updateStepStatus(stepId, StepStatus.RUNNING);
    
    // 创建步骤执行函数
    const executeFn: StepExecuteFn = async (stepDef, input, ctx) => {
      // ctx 是 Context 接口类型，但实际上是 Context 类实例
      return this.executeStepLogic(stepDef, input, ctx as unknown as Context);
    };
    
    // 准备步骤输入（包含依赖步骤的输出）
    const dependencyInput = createDependencyInput(step, context);
    
    // 执行步骤
    const result = await this.executor!.executeStep(
      step,
      context,
      executeFn,
      dependencyInput
    );
    
    // 处理执行结果
    this.handleStepResult(step, result);
  }

  /**
   * 执行步骤的实际逻辑
   * 根据步骤类型执行不同的逻辑
   * @param step 步骤定义
   * @param input 步骤输入
   * @param context 执行上下文
   * @returns 步骤输出
   */
  private async executeStepLogic(
    step: StepDefinition,
    input: unknown,
    context: Context
  ): Promise<unknown> {
    // 1. 如果步骤配置了 UI，处理 UI 交互
    if (step.ui) {
      const uiResult = await this.uiHandler!.handleUI(step.id, step.ui, context);
      if (!uiResult.success) {
        throw uiResult.error || new Error('UI 交互失败');
      }
      // 返回 UI 交互结果
      return {
        uiResponse: uiResult.response,
        selectedOption: uiResult.selectedOption,
      };
    }
    
    // 2. 如果步骤配置了工具调用，执行工具
    if (step.tools && step.tools.length > 0) {
      const toolResults = await executeToolInvocations(
        this.toolInvoker!,
        step.tools,
        context,
        step.id
      );
      
      // 检查是否有工具调用失败
      const failedResult = toolResults.find((r) => !r.success);
      if (failedResult) {
        throw failedResult.error || new Error(`工具 ${failedResult.toolId} 执行失败`);
      }
      
      // 返回所有工具调用结果
      return toolResults.map((r) => ({
        toolId: r.toolId,
        result: r.result,
      }));
    }
    
    // 3. 默认步骤逻辑：直接返回输入
    return input;
  }

  /**
   * 处理步骤执行结果
   * @param step 步骤定义
   * @param result 执行结果
   */
  private handleStepResult(step: StepDefinition, result: StepResult): void {
    const { id: stepId } = step;
    
    switch (result.status) {
      case StepStatus.SUCCESS:
        this.completedSteps.add(stepId);
        this.progressManager!.updateStepStatus(stepId, StepStatus.SUCCESS);
        break;
        
      case StepStatus.SKIPPED:
        this.completedSteps.add(stepId);
        this.progressManager!.updateStepStatus(stepId, StepStatus.SKIPPED);
        break;
        
      case StepStatus.FAILED:
        this.failedSteps.add(stepId);
        this.progressManager!.updateStepStatus(stepId, StepStatus.FAILED);
        break;
        
      case StepStatus.WAITING_INPUT:
        this.progressManager!.updateStepStatus(stepId, StepStatus.WAITING_INPUT);
        break;
    }
  }

  /**
   * 暂停工作流执行
   */
  pause(): void {
    if (!this.instance) {
      throw new Error('没有正在执行的工作流');
    }
    
    if (this.instance.status !== WorkflowStatus.RUNNING) {
      throw new Error('工作流未在运行中');
    }
    
    this.instance.status = WorkflowStatus.PAUSED;
    this.progressManager!.setWorkflowStatus(WorkflowStatus.PAUSED);
  }

  /**
   * 恢复工作流执行
   */
  resume(): void {
    if (!this.instance) {
      throw new Error('没有正在执行的工作流');
    }
    
    if (this.instance.status !== WorkflowStatus.PAUSED) {
      throw new Error('工作流未处于暂停状态');
    }
    
    this.instance.status = WorkflowStatus.RUNNING;
    this.progressManager!.setWorkflowStatus(WorkflowStatus.RUNNING);
  }

  /**
   * 取消工作流执行
   */
  cancel(): void {
    if (!this.instance) {
      throw new Error('没有正在执行的工作流');
    }
    
    // 取消所有等待中的操作
    this.waitManager?.cancelAllWaits('工作流已取消');
    
    // 更新状态
    this.instance.status = WorkflowStatus.FAILED;
    this.instance.endTime = Date.now();
    
    // 发出失败事件
    this.progressManager!.emitWorkflowFailed(new Error('工作流已取消'));
  }

  /**
   * 等待恢复
   */
  private async waitForResume(): Promise<void> {
    while (this.instance?.status === WorkflowStatus.PAUSED) {
      await this.delay(100);
    }
  }

  /**
   * 延迟指定时间
   * @param ms 毫秒数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============ 查询接口 ============

  /**
   * 获取工作流状态
   * 
   * Requirements: 5.6
   * 
   * @returns 工作流状态
   */
  getStatus(): WorkflowStatus {
    return this.instance?.status ?? WorkflowStatus.IDLE;
  }

  /**
   * 获取执行上下文
   * 
   * Requirements: 5.6
   * 
   * @returns 执行上下文
   */
  getContext(): IContext | null {
    return this.instance?.context ?? null;
  }

  /**
   * 获取步骤条状态
   * 
   * Requirements: 13.6
   * 
   * @returns 步骤条状态
   */
  getStepBarState(): StepBarPayload | null {
    return this.progressManager?.getSnapshot() ?? null;
  }

  // ============ 注册表管理 ============

  /**
   * 注册工具
   * @param registration 工具注册项
   */
  registerTool(registration: ToolRegistration): void {
    this.toolRegistry.register(registration);
  }

  /**
   * 卸载工具
   * @param toolId 工具 ID
   */
  unregisterTool(toolId: string): void {
    this.toolRegistry.unregister(toolId);
  }

  /**
   * 注册 UI 组件
   * @param meta UI 组件元数据
   * @param renderer UI 渲染器
   */
  registerUIComponent(meta: UIComponentMeta, renderer: UIRenderer): void {
    const registration: UIComponentRegistration = { meta, renderer };
    this.uiRegistry.register(registration);
  }

  /**
   * 卸载 UI 组件
   * @param componentId 组件 ID
   */
  unregisterUIComponent(componentId: string): void {
    this.uiRegistry.unregister(componentId);
  }

  // ============ Hook 管理 ============

  /**
   * 添加全局 Hook
   * @param type Hook 类型
   * @param handler Hook 处理器
   */
  addGlobalHook(type: 'before' | 'after', handler: HookHandler): void {
    this.hookManager.addGlobalHook(type, handler);
  }

  /**
   * 移除全局 Hook
   * @param hookId Hook ID
   */
  removeGlobalHook(hookId: string): void {
    this.hookManager.removeGlobalHook(hookId);
  }

  // ============ 事件管理 ============

  /**
   * 注册事件监听器
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  on(eventType: EventType, listener: EventListener): void {
    this.eventEmitter.on(eventType, listener);
  }

  /**
   * 移除事件监听器
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  off(eventType: EventType, listener: EventListener): void {
    this.eventEmitter.off(eventType, listener);
  }

  // ============ 外部响应 ============

  /**
   * 响应 UI 交互
   * @param stepId 步骤 ID
   * @param response UI 渲染结果
   */
  respondToUI(stepId: string, response: UIRenderResult): void {
    this.uiHandler?.respondToUI(stepId, response);
  }

  /**
   * 响应工具调用
   * @param stepId 步骤 ID
   * @param toolId 工具 ID
   * @param result 执行结果
   */
  respondToTool(stepId: string, toolId: string, result: unknown): void {
    this.toolInvoker?.respondToTool(stepId, toolId, result);
  }

  // ============ 元数据查询 ============

  /**
   * 获取所有已注册工具的元数据
   * 
   * Requirements: 12.5
   * 
   * @returns 工具元数据列表
   */
  getRegisteredTools(): ToolMeta[] {
    return this.toolRegistry.getAll();
  }

  /**
   * 获取所有已注册 UI 组件的元数据
   * 
   * Requirements: 12.6
   * 
   * @returns UI 组件元数据列表
   */
  getRegisteredUIComponents(): UIComponentMeta[] {
    return this.uiRegistry.getAll();
  }

  /**
   * 注册步骤类型
   * 
   * Requirements: 12.4
   * 
   * @param meta 步骤类型元数据
   */
  registerStepType(meta: StepTypeMeta): void {
    this.stepTypeRegistry.set(meta.type, meta);
  }

  /**
   * 卸载步骤类型
   * 
   * @param type 步骤类型标识
   * @returns 是否成功卸载
   */
  unregisterStepType(type: string): boolean {
    return this.stepTypeRegistry.delete(type);
  }

  /**
   * 获取所有已注册步骤类型的元数据
   * 
   * Requirements: 12.4
   * 
   * @returns 步骤类型元数据列表
   */
  getRegisteredStepTypes(): StepTypeMeta[] {
    return Array.from(this.stepTypeRegistry.values());
  }

  /**
   * 获取指定步骤类型的元数据
   * 
   * Requirements: 12.8
   * 
   * @param type 步骤类型标识
   * @returns 步骤类型元数据，如果不存在返回 undefined
   */
  getStepTypeMeta(type: string): StepTypeMeta | undefined {
    return this.stepTypeRegistry.get(type);
  }

  /**
   * 检查步骤类型是否已注册
   * 
   * @param type 步骤类型标识
   * @returns 是否已注册
   */
  hasStepType(type: string): boolean {
    return this.stepTypeRegistry.has(type);
  }

  // ============ 序列化接口 ============

  /**
   * 导出工作流定义为 JSON 字符串
   * 将当前加载的工作流定义序列化为 JSON 格式
   * 
   * Requirements: 12.1, 12.2
   * 
   * @returns JSON 格式的工作流定义字符串
   * @throws Error 如果没有加载工作流
   */
  exportDefinition(): string {
    if (!this.instance) {
      throw new Error('没有加载的工作流定义');
    }
    
    // 创建可序列化的工作流定义副本
    const serializableDefinition = this.createSerializableDefinition(this.instance.definition);
    
    return JSON.stringify(serializableDefinition, null, 2);
  }

  /**
   * 从 JSON 字符串导入工作流定义
   * 解析 JSON 并加载工作流定义
   * 
   * Requirements: 12.1, 12.3
   * 
   * @param json JSON 格式的工作流定义字符串
   * @throws ValidationError 如果 JSON 格式无效或工作流定义无效
   */
  importDefinition(json: string): void {
    let parsed: unknown;
    
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new ValidationError('JSON 解析失败', [
        error instanceof Error ? error.message : '无效的 JSON 格式',
      ]);
    }
    
    // 验证解析结果是否为有效的工作流定义
    const definition = this.parseWorkflowDefinition(parsed);
    
    // 加载工作流定义
    this.loadWorkflow(definition);
  }

  /**
   * 创建可序列化的工作流定义
   * 将函数类型的属性转换为字符串表示
   * 
   * @param definition 原始工作流定义
   * @returns 可序列化的工作流定义
   */
  private createSerializableDefinition(definition: WorkflowDefinition): Record<string, unknown> {
    const result: Record<string, unknown> = {
      id: definition.id,
      name: definition.name,
    };
    
    if (definition.description) {
      result.description = definition.description;
    }
    
    // 序列化步骤
    result.steps = definition.steps.map((step) => this.serializeStep(step));
    
    // 序列化全局 Hook（如果有）
    if (definition.globalHooks) {
      result.globalHooks = this.serializeHookDefinition(definition.globalHooks);
    }
    
    return result;
  }

  /**
   * 序列化单个步骤定义
   * @param step 步骤定义
   * @returns 可序列化的步骤对象
   */
  private serializeStep(step: StepDefinition): Record<string, unknown> {
    const result: Record<string, unknown> = {
      id: step.id,
      name: step.name,
      type: step.type,
    };
    
    if (step.dependencies && step.dependencies.length > 0) {
      result.dependencies = step.dependencies;
    }
    
    if (step.config) {
      result.config = step.config;
    }
    
    if (step.retryPolicy) {
      result.retryPolicy = step.retryPolicy;
    }
    
    if (step.skipPolicy) {
      result.skipPolicy = this.serializeSkipPolicy(step.skipPolicy);
    }
    
    if (step.hooks) {
      result.hooks = this.serializeHookDefinition(step.hooks);
    }
    
    if (step.ui) {
      result.ui = step.ui;
    }
    
    if (step.tools && step.tools.length > 0) {
      result.tools = step.tools;
    }
    
    return result;
  }

  /**
   * 序列化跳过策略
   * 将函数类型的条件转换为字符串
   * @param skipPolicy 跳过策略
   * @returns 可序列化的跳过策略
   */
  private serializeSkipPolicy(skipPolicy: SkipPolicy): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    if (typeof skipPolicy.condition === 'function') {
      // 将函数转换为字符串表示
      result.condition = skipPolicy.condition.toString();
    } else {
      result.condition = skipPolicy.condition;
    }
    
    if (skipPolicy.defaultOutput !== undefined) {
      result.defaultOutput = skipPolicy.defaultOutput;
    }
    
    return result;
  }

  /**
   * 序列化 Hook 定义
   * 将 Hook 处理器转换为可序列化格式
   * @param hookDef Hook 定义
   * @returns 可序列化的 Hook 定义
   */
  private serializeHookDefinition(hookDef: HookDefinition): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    if (hookDef.beforeHooks && hookDef.beforeHooks.length > 0) {
      result.beforeHooks = hookDef.beforeHooks.map((hook) => ({
        id: hook.id,
        name: hook.name,
        handler: hook.handler.toString(),
      }));
    }
    
    if (hookDef.afterHooks && hookDef.afterHooks.length > 0) {
      result.afterHooks = hookDef.afterHooks.map((hook) => ({
        id: hook.id,
        name: hook.name,
        handler: hook.handler.toString(),
      }));
    }
    
    return result;
  }

  /**
   * 解析工作流定义
   * 从解析的 JSON 对象创建工作流定义
   * @param parsed 解析的 JSON 对象
   * @returns 工作流定义
   */
  private parseWorkflowDefinition(parsed: unknown): WorkflowDefinition {
    if (!parsed || typeof parsed !== 'object') {
      throw new ValidationError('无效的工作流定义格式', ['工作流定义必须是对象']);
    }
    
    const obj = parsed as Record<string, unknown>;
    const errors: string[] = [];
    
    // 验证必需字段
    if (typeof obj.id !== 'string') {
      errors.push('缺少或无效的 id 字段');
    }
    
    if (typeof obj.name !== 'string') {
      errors.push('缺少或无效的 name 字段');
    }
    
    if (!Array.isArray(obj.steps)) {
      errors.push('缺少或无效的 steps 字段');
    }
    
    if (errors.length > 0) {
      throw new ValidationError('工作流定义验证失败', errors);
    }
    
    // 解析步骤
    const steps = (obj.steps as unknown[]).map((step, index) => {
      return this.parseStepDefinition(step, index);
    });
    
    const definition: WorkflowDefinition = {
      id: obj.id as string,
      name: obj.name as string,
      steps,
    };
    
    if (typeof obj.description === 'string') {
      definition.description = obj.description;
    }
    
    // 解析全局 Hook（如果有）
    if (obj.globalHooks && typeof obj.globalHooks === 'object') {
      definition.globalHooks = this.parseHookDefinition(obj.globalHooks as Record<string, unknown>);
    }
    
    return definition;
  }

  /**
   * 解析步骤定义
   * @param step 步骤对象
   * @param index 步骤索引（用于错误消息）
   * @returns 步骤定义
   */
  private parseStepDefinition(step: unknown, index: number): StepDefinition {
    if (!step || typeof step !== 'object') {
      throw new ValidationError('无效的步骤定义', [`步骤 ${index} 必须是对象`]);
    }
    
    const obj = step as Record<string, unknown>;
    const errors: string[] = [];
    
    if (typeof obj.id !== 'string') {
      errors.push(`步骤 ${index} 缺少或无效的 id 字段`);
    }
    
    if (typeof obj.name !== 'string') {
      errors.push(`步骤 ${index} 缺少或无效的 name 字段`);
    }
    
    if (typeof obj.type !== 'string') {
      errors.push(`步骤 ${index} 缺少或无效的 type 字段`);
    }
    
    if (errors.length > 0) {
      throw new ValidationError('步骤定义验证失败', errors);
    }
    
    const result: StepDefinition = {
      id: obj.id as string,
      name: obj.name as string,
      type: obj.type as string,
    };
    
    // 解析可选字段
    if (Array.isArray(obj.dependencies)) {
      result.dependencies = obj.dependencies as string[];
    }
    
    if (obj.config && typeof obj.config === 'object') {
      result.config = obj.config as Record<string, unknown>;
    }
    
    if (obj.retryPolicy && typeof obj.retryPolicy === 'object') {
      result.retryPolicy = obj.retryPolicy as RetryPolicy;
    }
    
    if (obj.skipPolicy && typeof obj.skipPolicy === 'object') {
      result.skipPolicy = this.parseSkipPolicy(obj.skipPolicy as Record<string, unknown>);
    }
    
    if (obj.hooks && typeof obj.hooks === 'object') {
      result.hooks = this.parseHookDefinition(obj.hooks as Record<string, unknown>);
    }
    
    if (obj.ui && typeof obj.ui === 'object') {
      result.ui = obj.ui as UIConfig;
    }
    
    if (Array.isArray(obj.tools)) {
      result.tools = obj.tools as ToolInvocation[];
    }
    
    return result;
  }

  /**
   * 解析跳过策略
   * @param skipPolicy 跳过策略对象
   * @returns 跳过策略
   */
  private parseSkipPolicy(skipPolicy: Record<string, unknown>): SkipPolicy {
    const result: SkipPolicy = {
      condition: '',
    };
    
    if (typeof skipPolicy.condition === 'string') {
      result.condition = skipPolicy.condition;
    } else if (typeof skipPolicy.condition === 'function') {
      result.condition = skipPolicy.condition as SkipConditionFn;
    }
    
    if (skipPolicy.defaultOutput !== undefined) {
      result.defaultOutput = skipPolicy.defaultOutput;
    }
    
    return result;
  }

  /**
   * 解析 Hook 定义
   * @param hookDef Hook 定义对象
   * @returns Hook 定义
   */
  private parseHookDefinition(hookDef: Record<string, unknown>): HookDefinition {
    const result: HookDefinition = {};
    
    if (Array.isArray(hookDef.beforeHooks)) {
      result.beforeHooks = hookDef.beforeHooks.map((hook: unknown) => {
        const h = hook as Record<string, unknown>;
        return {
          id: h.id as string,
          name: h.name as string,
          // 注意：从 JSON 导入的 handler 是字符串，需要外部处理
          handler: (typeof h.handler === 'function' 
            ? h.handler 
            : async () => {}) as HookFn,
        };
      });
    }
    
    if (Array.isArray(hookDef.afterHooks)) {
      result.afterHooks = hookDef.afterHooks.map((hook: unknown) => {
        const h = hook as Record<string, unknown>;
        return {
          id: h.id as string,
          name: h.name as string,
          handler: (typeof h.handler === 'function' 
            ? h.handler 
            : async () => {}) as HookFn,
        };
      });
    }
    
    return result;
  }

  // ============ 工作流定义验证接口 ============

  /**
   * 验证工作流定义
   * 检查工作流定义的有效性，包括结构验证和循环依赖检测
   * 
   * Requirements: 12.7
   * 
   * @param definition 工作流定义
   * @returns 验证结果
   */
  validateWorkflowDefinition(definition: WorkflowDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // 1. 基本结构验证
    if (!definition.id) {
      errors.push('工作流定义缺少 id');
    }
    
    if (!definition.name) {
      errors.push('工作流定义缺少 name');
    }
    
    if (!definition.steps || definition.steps.length === 0) {
      errors.push('工作流定义缺少步骤');
    }
    
    // 2. 步骤验证
    const stepIds = new Set<string>();
    for (const step of definition.steps || []) {
      if (!step.id) {
        errors.push('步骤缺少 id');
      } else if (stepIds.has(step.id)) {
        errors.push(`步骤 ID 重复: ${step.id}`);
      } else {
        stepIds.add(step.id);
      }
      
      if (!step.name) {
        errors.push(`步骤 ${step.id} 缺少 name`);
      }
      
      if (!step.type) {
        errors.push(`步骤 ${step.id} 缺少 type`);
      }
      
      // 验证依赖引用
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          if (!stepIds.has(depId) && !definition.steps.some(s => s.id === depId)) {
            errors.push(`步骤 ${step.id} 引用了不存在的依赖: ${depId}`);
          }
        }
      }
    }
    
    // 3. 循环依赖检测
    if (errors.length === 0) {
      try {
        const dag = this.scheduler.parse(definition);
        this.scheduler.validate(dag);
      } catch (error) {
        if (error instanceof CyclicDependencyError) {
          errors.push(`检测到循环依赖: ${error.cycle.join(' -> ')}`);
        } else if (error instanceof ValidationError) {
          errors.push(...error.details);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
