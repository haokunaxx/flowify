/**
 * Echo 工具 - 回显输入内容
 * 用于测试和调试工作流
 */
import type { ToolRegistration, Context } from '@flowify/core';
import { ToolMode } from '@flowify/core';

/**
 * Echo 工具注册项
 * 接收一个消息参数，将其回显并返回
 */
export const echoTool: ToolRegistration = {
  meta: {
    id: 'echo',
    name: 'Echo',
    description: '回显输入内容',
    mode: ToolMode.SYNC,
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '要回显的消息' },
      },
      required: ['message'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        echo: { type: 'string', description: '回显的消息' },
      },
    },
  },
  executor: {
    execute: async (params: unknown, _context: Context) => {
      const { message } = params as { message: string };
      console.log(`[Echo] ${message}`);
      return { echo: message };
    },
  },
};
