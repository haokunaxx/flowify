/**
 * 注册表模块
 * 提供工具和 UI 组件的注册、查找和管理功能
 */

import {
  ToolMeta,
  ToolExecutor,
  ToolRegistration,
  UIComponentMeta,
  UIRenderer,
  UIComponentRegistration,
} from '../core/types';
import { ToolNotFoundError, UIComponentNotFoundError } from '../core/errors';

/**
 * 工具注册表
 * 管理工具的注册、卸载和查找
 * 
 * Requirements: 11.1, 11.2, 11.9
 */
export class ToolRegistry {
  /** 工具存储映射表 */
  private tools: Map<string, ToolRegistration> = new Map();

  /**
   * 注册工具
   * @param registration 工具注册项（包含元数据和执行器）
   * @throws Error 如果工具 ID 已存在
   */
  register(registration: ToolRegistration): void {
    const { meta } = registration;
    if (this.tools.has(meta.id)) {
      throw new Error(`工具已存在: ${meta.id}`);
    }
    this.tools.set(meta.id, registration);
  }

  /**
   * 卸载工具
   * @param toolId 工具标识符
   * @returns 是否成功卸载（如果工具不存在返回 false）
   */
  unregister(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  /**
   * 获取工具
   * @param toolId 工具标识符
   * @returns 工具注册项
   * @throws ToolNotFoundError 如果工具未注册
   */
  get(toolId: string): ToolRegistration {
    const registration = this.tools.get(toolId);
    if (!registration) {
      throw new ToolNotFoundError(toolId);
    }
    return registration;
  }

  /**
   * 获取所有已注册工具的元数据
   * @returns 所有工具的元数据数组
   */
  getAll(): ToolMeta[] {
    return Array.from(this.tools.values()).map((reg) => reg.meta);
  }

  /**
   * 检查工具是否已注册
   * @param toolId 工具标识符
   * @returns 是否已注册
   */
  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * 获取已注册工具数量
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * 清空所有注册的工具
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * UI 组件注册表
 * 管理 UI 组件的注册、卸载和查找
 * 
 * Requirements: 10.1, 10.7
 */
export class UIRegistry {
  /** UI 组件存储映射表 */
  private components: Map<string, UIComponentRegistration> = new Map();

  /**
   * 注册 UI 组件
   * @param registration 组件注册项（包含元数据和渲染器）
   * @throws Error 如果组件 ID 已存在
   */
  register(registration: UIComponentRegistration): void {
    const { meta } = registration;
    if (this.components.has(meta.id)) {
      throw new Error(`UI 组件已存在: ${meta.id}`);
    }
    this.components.set(meta.id, registration);
  }

  /**
   * 卸载 UI 组件
   * @param componentId 组件标识符
   * @returns 是否成功卸载（如果组件不存在返回 false）
   */
  unregister(componentId: string): boolean {
    return this.components.delete(componentId);
  }

  /**
   * 获取 UI 组件
   * @param componentId 组件标识符
   * @returns 组件注册项
   * @throws UIComponentNotFoundError 如果组件未注册
   */
  get(componentId: string): UIComponentRegistration {
    const registration = this.components.get(componentId);
    if (!registration) {
      throw new UIComponentNotFoundError(componentId);
    }
    return registration;
  }

  /**
   * 获取所有已注册 UI 组件的元数据
   * @returns 所有组件的元数据数组
   */
  getAll(): UIComponentMeta[] {
    return Array.from(this.components.values()).map((reg) => reg.meta);
  }

  /**
   * 检查 UI 组件是否已注册
   * @param componentId 组件标识符
   * @returns 是否已注册
   */
  has(componentId: string): boolean {
    return this.components.has(componentId);
  }

  /**
   * 获取已注册组件数量
   */
  get size(): number {
    return this.components.size;
  }

  /**
   * 清空所有注册的组件
   */
  clear(): void {
    this.components.clear();
  }
}
