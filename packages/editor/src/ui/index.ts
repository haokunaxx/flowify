/**
 * 内置 UI 组件导出入口
 * 提供所有内置 UI 组件的统一导出和注册辅助函数
 */

import type { UIRegistry } from '@flowify/engine';
import { confirmComponent } from './confirm';
import { selectComponent } from './select';

/**
 * 所有内置 UI 组件列表
 */
export const builtinUIComponents = [confirmComponent, selectComponent] as const;

/**
 * 注册所有内置 UI 组件到 UI 注册表
 * @param registry UI 注册表实例
 */
export function registerBuiltinUIComponents(registry: UIRegistry): void {
  for (const component of builtinUIComponents) {
    registry.register(component);
  }
}

// 导出所有内置 UI 组件
export { confirmComponent, ConfirmDialog } from './confirm';
export type { ConfirmDialogProps } from './confirm';
export { selectComponent, SelectDialog } from './select';
export type { SelectDialogProps } from './select';
