/**
 * UI 交互系统模块
 * 实现展示型、确认型和选择型 UI 处理
 * 
 * Requirements: 10.3, 10.4, 10.5, 10.6
 */

import type {
  UIConfig,
  UIRenderResult,
  UISelectOption,
  Context,
  UIComponentRegistration,
} from '../core/types';
import { UIMode } from '../core/types';
import { UIComponentNotFoundError, TimeoutError } from '../core/errors';
import { UIRegistry } from '../registry';
import { EventEmitter, EventType, createWorkflowEvent } from '../events';

// ============ UI 交互结果类型 ============

/**
 * UI 交互结果
 */
export interface UIInteractionResult {
  /** 是否成功 */
  success: boolean;
  /** 步骤 ID */
  stepId: string;
  /** UI 模式 */
  mode: UIMode;
  /** 用户响应数据 */
  response?: unknown;
  /** 选中的选项 ID（选择型 UI） */
  selectedOption?: string;
  /** 错误信息 */
  error?: Error;
  /** 是否超时自动继续 */
  autoCompleted?: boolean;
}

/**
 * 等待中的 UI 交互信息
 */
export interface PendingUIInteraction {
  /** 步骤 ID */
  stepId: string;
  /** UI 配置 */
  config: UIConfig;
  /** 开始时间 */
  startTime: number;
  /** 超时定时器 ID */
  timeoutId?: ReturnType<typeof setTimeout>;
  /** 完成回调 */
  resolve: (result: UIInteractionResult) => void;
}

// ============ UI 交互处理器 ============

/**
 * UI 交互处理器
 * 负责处理展示型、确认型和选择型 UI 交互
 */
export class UIInteractionHandler {
  /** UI 组件注册表 */
  private registry: UIRegistry;
  
  /** 事件发射器 */
  private eventEmitter: EventEmitter;
  
  /** 工作流 ID */
  private workflowId: string;
  
  /** 实例 ID */
  private instanceId: string;
  
  /** 等待中的 UI 交互 */
  private pendingInteractions: Map<string, PendingUIInteraction> = new Map();

  /**
   * 创建 UI 交互处理器
   * @param registry UI 组件注册表
   * @param eventEmitter 事件发射器
   * @param workflowId 工作流 ID
   * @param instanceId 实例 ID
   */
  constructor(
    registry: UIRegistry,
    eventEmitter: EventEmitter,
    workflowId: string,
    instanceId: string
  ) {
    this.registry = registry;
    this.eventEmitter = eventEmitter;
    this.workflowId = workflowId;
    this.instanceId = instanceId;
  }

  /**
   * 处理 UI 交互
   * 根据 UI 模式自动选择处理方式
   * 
   * @param stepId 步骤 ID
   * @param config UI 配置
   * @param context 工作流上下文
   * @returns UI 交互结果
   */
  async handleUI(
    stepId: string,
    config: UIConfig,
    context: Context
  ): Promise<UIInteractionResult> {
    // 1. 验证 UI 组件是否已注册
    let registration: UIComponentRegistration;
    try {
      registration = this.registry.get(config.componentId);
    } catch (error) {
      if (error instanceof UIComponentNotFoundError) {
        return {
          success: false,
          stepId,
          mode: config.mode,
          error,
        };
      }
      throw error;
    }

    // 2. 验证组件是否支持该交互模式
    if (!registration.meta.supportedModes.includes(config.mode)) {
      return {
        success: false,
        stepId,
        mode: config.mode,
        error: new Error(
          `UI 组件 ${config.componentId} 不支持 ${config.mode} 模式`
        ),
      };
    }

    // 3. 根据模式处理 UI 交互
    switch (config.mode) {
      case UIMode.DISPLAY:
        return this.handleDisplayUI(stepId, config, context, registration);
      case UIMode.CONFIRM:
        return this.handleConfirmUI(stepId, config, context);
      case UIMode.SELECT:
        return this.handleSelectUI(stepId, config, context);
      default:
        return {
          success: false,
          stepId,
          mode: config.mode,
          error: new Error(`未知的 UI 模式: ${config.mode}`),
        };
    }
  }

  /**
   * 处理展示型 UI
   * 发出 UI 渲染事件，在指定时间后自动继续执行
   * 
   * Requirements: 10.3, 10.6
   * 
   * @param stepId 步骤 ID
   * @param config UI 配置
   * @param context 工作流上下文
   * @param registration UI 组件注册项
   * @returns UI 交互结果
   */
  private async handleDisplayUI(
    stepId: string,
    config: UIConfig,
    context: Context,
    registration: UIComponentRegistration
  ): Promise<UIInteractionResult> {
    const startTime = Date.now();

    // 发出 UI 渲染事件
    this.emitUIRenderEvent(stepId, config);

    // 调用渲染器（如果有）
    let renderResult: UIRenderResult | undefined;
    try {
      renderResult = await registration.renderer.render(config, context);
    } catch (error) {
      // 渲染失败不阻止继续执行，只记录错误
      console.warn(`UI 渲染失败: ${error}`);
    }

    // 获取超时时间，默认 3000ms
    const timeout = config.timeout ?? 3000;

    // 等待指定时间后自动继续
    await this.delay(timeout);

    // 发出 UI 响应事件
    this.emitUIResponseEvent(stepId, {
      autoCompleted: true,
      timeout,
    });

    return {
      success: true,
      stepId,
      mode: UIMode.DISPLAY,
      response: renderResult?.userResponse,
      autoCompleted: true,
    };
  }

  /**
   * 处理确认型 UI
   * 发出 UI 渲染事件并等待用户确认
   * 
   * Requirements: 10.4
   * 
   * @param stepId 步骤 ID
   * @param config UI 配置
   * @param context 工作流上下文
   * @returns UI 交互结果
   */
  private async handleConfirmUI(
    stepId: string,
    config: UIConfig,
    context: Context
  ): Promise<UIInteractionResult> {
    // 发出 UI 渲染事件
    this.emitUIRenderEvent(stepId, config);

    // 创建等待 Promise
    return new Promise<UIInteractionResult>((resolve) => {
      const pendingInteraction: PendingUIInteraction = {
        stepId,
        config,
        startTime: Date.now(),
        resolve,
      };

      // 如果配置了超时，设置超时定时器
      if (config.timeout && config.timeout > 0) {
        pendingInteraction.timeoutId = setTimeout(() => {
          if (this.pendingInteractions.has(stepId)) {
            this.pendingInteractions.delete(stepId);
            
            // 发出超时事件
            this.emitUIResponseEvent(stepId, {
              timeout: true,
              timeoutMs: config.timeout,
            });

            resolve({
              success: false,
              stepId,
              mode: UIMode.CONFIRM,
              error: new TimeoutError(
                `UI 确认超时`,
                stepId,
                config.timeout!
              ),
            });
          }
        }, config.timeout);
      }

      this.pendingInteractions.set(stepId, pendingInteraction);
    });
  }

  /**
   * 处理选择型 UI
   * 发出 UI 渲染事件并等待用户选择
   * 
   * Requirements: 10.5
   * 
   * @param stepId 步骤 ID
   * @param config UI 配置
   * @param context 工作流上下文
   * @returns UI 交互结果
   */
  private async handleSelectUI(
    stepId: string,
    config: UIConfig,
    context: Context
  ): Promise<UIInteractionResult> {
    // 验证选项配置
    if (!config.options || config.options.length === 0) {
      return {
        success: false,
        stepId,
        mode: UIMode.SELECT,
        error: new Error('选择型 UI 必须配置选项'),
      };
    }

    // 发出 UI 渲染事件（包含选项信息）
    this.emitUIRenderEvent(stepId, config);

    // 创建等待 Promise
    return new Promise<UIInteractionResult>((resolve) => {
      const pendingInteraction: PendingUIInteraction = {
        stepId,
        config,
        startTime: Date.now(),
        resolve,
      };

      // 如果配置了超时，设置超时定时器
      if (config.timeout && config.timeout > 0) {
        pendingInteraction.timeoutId = setTimeout(() => {
          if (this.pendingInteractions.has(stepId)) {
            this.pendingInteractions.delete(stepId);
            
            // 发出超时事件
            this.emitUIResponseEvent(stepId, {
              timeout: true,
              timeoutMs: config.timeout,
            });

            resolve({
              success: false,
              stepId,
              mode: UIMode.SELECT,
              error: new TimeoutError(
                `UI 选择超时`,
                stepId,
                config.timeout!
              ),
            });
          }
        }, config.timeout);
      }

      this.pendingInteractions.set(stepId, pendingInteraction);
    });
  }

  /**
   * 响应 UI 交互
   * 外部系统调用此方法提供用户响应
   * 
   * @param stepId 步骤 ID
   * @param response UI 渲染结果
   * @returns 是否成功响应
   */
  respondToUI(stepId: string, response: UIRenderResult): boolean {
    const pendingInteraction = this.pendingInteractions.get(stepId);

    if (!pendingInteraction) {
      return false;
    }

    // 清除超时定时器
    if (pendingInteraction.timeoutId) {
      clearTimeout(pendingInteraction.timeoutId);
    }

    // 移除等待记录
    this.pendingInteractions.delete(stepId);

    const { config } = pendingInteraction;

    // 发出 UI 响应事件
    this.emitUIResponseEvent(stepId, {
      response: response.userResponse,
      selectedOption: response.selectedOption,
    });

    // 验证选择型 UI 的选项
    if (config.mode === UIMode.SELECT) {
      if (!response.selectedOption) {
        pendingInteraction.resolve({
          success: false,
          stepId,
          mode: UIMode.SELECT,
          error: new Error('选择型 UI 必须提供选中的选项'),
        });
        return true;
      }

      // 验证选项是否有效
      const validOption = config.options?.find(
        (opt) => opt.id === response.selectedOption
      );
      if (!validOption) {
        pendingInteraction.resolve({
          success: false,
          stepId,
          mode: UIMode.SELECT,
          error: new Error(`无效的选项: ${response.selectedOption}`),
        });
        return true;
      }
    }

    // 成功响应
    pendingInteraction.resolve({
      success: true,
      stepId,
      mode: config.mode,
      response: response.userResponse,
      selectedOption: response.selectedOption,
    });

    return true;
  }

  /**
   * 检查是否有等待中的 UI 交互
   * @param stepId 步骤 ID（可选，不提供则检查所有）
   * @returns 是否有等待中的交互
   */
  hasPendingInteractions(stepId?: string): boolean {
    if (!stepId) {
      return this.pendingInteractions.size > 0;
    }
    return this.pendingInteractions.has(stepId);
  }

  /**
   * 获取等待中的 UI 交互数量
   */
  getPendingInteractionCount(): number {
    return this.pendingInteractions.size;
  }

  /**
   * 取消等待中的 UI 交互
   * @param stepId 步骤 ID
   */
  cancelPendingInteraction(stepId: string): boolean {
    const pendingInteraction = this.pendingInteractions.get(stepId);

    if (!pendingInteraction) {
      return false;
    }

    // 清除超时定时器
    if (pendingInteraction.timeoutId) {
      clearTimeout(pendingInteraction.timeoutId);
    }

    // 移除等待记录
    this.pendingInteractions.delete(stepId);

    // 发出取消事件
    this.emitUIResponseEvent(stepId, { cancelled: true });

    // 返回取消结果
    pendingInteraction.resolve({
      success: false,
      stepId,
      mode: pendingInteraction.config.mode,
      error: new Error('UI 交互已取消'),
    });

    return true;
  }

  /**
   * 获取选项的值
   * 用于选择型 UI，根据选中的选项 ID 获取选项值
   * 
   * @param options 选项列表
   * @param selectedOptionId 选中的选项 ID
   * @returns 选项值
   */
  getOptionValue(
    options: UISelectOption[],
    selectedOptionId: string
  ): unknown {
    const option = options.find((opt) => opt.id === selectedOptionId);
    return option?.value ?? selectedOptionId;
  }

  /**
   * 延迟指定时间
   * @param ms 毫秒数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 发出 UI 渲染事件
   */
  private emitUIRenderEvent(stepId: string, config: UIConfig): void {
    const event = createWorkflowEvent(
      EventType.UI_RENDER,
      this.workflowId,
      this.instanceId,
      {
        componentId: config.componentId,
        mode: config.mode,
        data: config.data,
        timeout: config.timeout,
        options: config.options,
      },
      stepId
    );
    this.eventEmitter.emit(event);
  }

  /**
   * 发出 UI 响应事件
   */
  private emitUIResponseEvent(stepId: string, payload: unknown): void {
    const event = createWorkflowEvent(
      EventType.UI_RESPONSE,
      this.workflowId,
      this.instanceId,
      payload,
      stepId
    );
    this.eventEmitter.emit(event);
  }
}

