/**
 * 内置工具导出入口
 * 提供所有内置工具的统一导出和注册辅助函数
 */

import type { ToolRegistry } from '@flowify/engine';
import { echoTool } from './echo';
import { delayTool } from './delay';

/**
 * 所有内置工具列表
 */
export const builtinTools = [echoTool, delayTool] as const;

/**
 * 注册所有内置工具到工具注册表
 * @param registry 工具注册表实例
 */
export function registerBuiltinTools(registry: ToolRegistry): void {
  for (const tool of builtinTools) {
    registry.register(tool);
  }
}

// 导出所有内置工具
export { echoTool } from './echo';
export { delayTool } from './delay';
