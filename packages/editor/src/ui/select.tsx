/**
 * Select 组件 - 选择器
 * 显示选项列表供用户选择
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
 * Select 组件注册项
 * 实现 UIComponentRegistration 接口
 */
export const selectComponent: UIComponentRegistration = {
  meta: {
    id: 'select',
    name: 'Select',
    description: '选择器组件',
    supportedModes: [UIMode.SELECT],
    propsSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '标题' },
        options: {
          type: 'array',
          items: { type: 'object' },
          description: '选项列表',
        },
      },
    },
  },
  renderer: {
    render: async (config: UIConfig, context: Context): Promise<UIRenderResult> => {
      // 实际渲染逻辑将在可视化编排器中实现
      // 这里返回模拟结果，选择第一个选项
      const firstOption = config.options?.[0];
      return {
        rendered: true,
        selectedOption: firstOption?.id,
      };
    },
  },
};

/**
 * SelectDialog 组件属性
 */
export interface SelectDialogProps {
  /** 对话框标题（可选） */
  title?: string;
  /** 选项列表 */
  options: Array<{ id: string; label: string }>;
  /** 选择回调 */
  onSelect: (id: string) => void;
}

/**
 * SelectDialog React 组件
 * 用于可视化编排器中的选择对话框
 */
export const SelectDialog: React.FC<SelectDialogProps> = ({
  title,
  options,
  onSelect,
}) => {
  return (
    <div className="select-dialog">
      {title && <h3>{title}</h3>}
      <ul>
        {options.map((option) => (
          <li key={option.id} onClick={() => onSelect(option.id)}>
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
