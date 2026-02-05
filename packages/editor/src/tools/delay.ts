/**
 * Delay 工具 - 延时执行
 * 用于模拟异步操作或添加等待时间
 */
import type { ToolRegistration, Context } from '@flowify/core';
import { ToolMode } from '@flowify/core';

/**
 * Delay 工具注册项
 * 接收一个毫秒数参数，延时指定时间后返回
 */
export const delayTool: ToolRegistration = {
  meta: {
    id: 'delay',
    name: 'Delay',
    description: '延时指定毫秒数',
    mode: ToolMode.ASYNC,
    inputSchema: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: '延时毫秒数' },
      },
      required: ['ms'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        delayed: { type: 'number', description: '实际延时的毫秒数' },
      },
    },
  },
  executor: {
    execute: async (params: unknown, _context: Context) => {
      const { ms } = params as { ms: number };
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { delayed: ms };
    },
  },
};
