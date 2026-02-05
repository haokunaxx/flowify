/**
 * Confirm 组件 - 确认框
 * 显示消息并等待用户确认
 */
import React from 'react';
import {
  UIMode,
  type UIComponentRegistration,
  type UIConfig,
  type Context,
  type UIRenderResult,
} from '@flowify/core';

/**
 * Confirm 组件注册项
 * 实现 UIComponentRegistration 接口
 */
export const confirmComponent: UIComponentRegistration = {
  meta: {
    id: 'confirm',
    name: 'Confirm',
    description: '确认框组件',
    supportedModes: [UIMode.CONFIRM],
    propsSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '标题' },
        message: { type: 'string', description: '消息内容' },
      },
    },
  },
  renderer: {
    render: async (config: UIConfig, context: Context): Promise<UIRenderResult> => {
      // 实际渲染逻辑将在可视化编排器中实现
      // 这里返回模拟结果
      return {
        rendered: true,
        userResponse: { confirmed: true },
      };
    },
  },
};

/**
 * ConfirmDialog 组件属性
 */
export interface ConfirmDialogProps {
  /** 对话框标题（可选） */
  title?: string;
  /** 消息内容 */
  message: string;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

/**
 * ConfirmDialog React 组件
 * 用于可视化编排器中的确认对话框
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="confirm-dialog">
      {title && <h3>{title}</h3>}
      <p>{message}</p>
      <div className="actions">
        <button onClick={onCancel}>取消</button>
        <button onClick={onConfirm}>确认</button>
      </div>
    </div>
  );
};
