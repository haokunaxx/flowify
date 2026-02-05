/**
 * 工作流引擎 UI 交互演示
 * 
 * 演示功能：
 * 1. 展示型 UI（自动继续）
 * 2. 确认型 UI（等待用户确认）
 * 3. 选择型 UI（根据选择决定路径）
 */

import {
  WorkflowEngine,
  WorkflowDefinition,
  StepStatus,
  WorkflowStatus,
  ToolMode,
  UIMode,
  EventType,
  WorkflowEvent,
  ProgressPayload,
  Context,
} from '../src';

// ============ 辅助函数 ============

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ 工具定义 ============

const fetchDataTool = {
  meta: {
    id: 'fetch-data',
    name: '数据获取',
    mode: ToolMode.SYNC,
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      console.log('  📡 正在获取数据...');
      await delay(300);
      const data = { items: ['数据A', '数据B', '数据C'], count: 3 };
      context.setGlobal('rawData', data);
      return data;
    },
  },
};

const quickProcessTool = {
  meta: {
    id: 'quick-process',
    name: '快速处理',
    mode: ToolMode.SYNC,
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      console.log('  ⚡ 执行快速处理...');
      await delay(200);
      return { method: '快速处理', result: '处理完成（简化版）' };
    },
  },
};

const fullProcessTool = {
  meta: {
    id: 'full-process',
    name: '完整处理',
    mode: ToolMode.SYNC,
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      console.log('  🔧 执行完整处理...');
      await delay(500);
      return { method: '完整处理', result: '处理完成（完整版，包含详细分析）' };
    },
  },
};

const generateReportTool = {
  meta: {
    id: 'generate-report',
    name: '生成报告',
    mode: ToolMode.SYNC,
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      console.log('  📊 生成最终报告...');
      await delay(200);
      const processResult = context.getGlobal('processResult') as { method: string; result: string } | undefined;
      return {
        title: '处理报告',
        method: processResult?.method || '未知',
        result: processResult?.result || '无结果',
        timestamp: new Date().toLocaleString('zh-CN'),
      };
    },
  },
};

// ============ UI 组件定义 ============

// 通知组件（展示型）
const notificationComponent = {
  meta: {
    id: 'notification',
    name: '通知组件',
    description: '显示通知消息，自动消失',
    supportedModes: [UIMode.DISPLAY],
  },
  renderer: {
    render: async (config: { data?: Record<string, unknown> }, context: Context) => {
      const message = config.data?.message || '通知';
      console.log(`\n  ╔════════════════════════════════════════╗`);
      console.log(`  ║  📢 ${message}`);
      console.log(`  ╚════════════════════════════════════════╝\n`);
      return { rendered: true };
    },
  },
};

// 确认对话框组件（确认型）
const confirmDialogComponent = {
  meta: {
    id: 'confirm-dialog',
    name: '确认对话框',
    description: '需要用户确认的对话框',
    supportedModes: [UIMode.CONFIRM],
  },
  renderer: {
    render: async (config: { data?: Record<string, unknown> }, context: Context) => {
      const message = config.data?.message || '请确认';
      console.log(`\n  ╔════════════════════════════════════════╗`);
      console.log(`  ║  ❓ ${message}`);
      console.log(`  ╚════════════════════════════════════════╝`);
      return { rendered: true };
    },
  },
};

// 选择对话框组件（选择型）
const choiceDialogComponent = {
  meta: {
    id: 'choice-dialog',
    name: '选择对话框',
    description: '让用户选择选项的对话框',
    supportedModes: [UIMode.SELECT],
  },
  renderer: {
    render: async (config: { data?: Record<string, unknown>; options?: Array<{ id: string; label: string }> }, context: Context) => {
      const message = config.data?.message || '请选择';
      console.log(`\n  ╔════════════════════════════════════════╗`);
      console.log(`  ║  🔀 ${message}`);
      if (config.options) {
        config.options.forEach((opt, i) => {
          console.log(`  ║  [${i + 1}] ${opt.label}`);
        });
      }
      console.log(`  ╚════════════════════════════════════════╝`);
      return { rendered: true };
    },
  },
};

// ============ 工作流定义 ============

/**
 * 带 UI 交互的工作流
 * 
 * 流程：
 * 1. 显示欢迎通知（展示型，自动继续）
 * 2. 获取数据
 * 3. 确认是否继续处理（确认型，等待用户）
 * 4. 选择处理方式（选择型，根据选择决定路径）
 * 5. 执行对应的处理（快速/完整）
 * 6. 生成报告
 */
const uiWorkflow: WorkflowDefinition = {
  id: 'ui-workflow',
  name: 'UI 交互工作流',
  description: '演示各种 UI 交互模式',
  steps: [
    // 步骤 1: 展示型 UI - 显示欢迎通知
    {
      id: 'welcome',
      name: '欢迎通知',
      type: 'ui',
      ui: {
        componentId: 'notification',
        mode: UIMode.DISPLAY,
        data: { message: '欢迎使用数据处理系统！' },
        timeout: 1000, // 1 秒后自动继续
      },
    },
    // 步骤 2: 获取数据
    {
      id: 'fetch',
      name: '获取数据',
      type: 'tool',
      dependencies: ['welcome'],
      tools: [{ toolId: 'fetch-data' }],
    },
    // 步骤 3: 确认型 UI - 确认是否继续
    {
      id: 'confirm',
      name: '确认处理',
      type: 'ui',
      dependencies: ['fetch'],
      ui: {
        componentId: 'confirm-dialog',
        mode: UIMode.CONFIRM,
        data: { message: '已获取 3 条数据，是否继续处理？' },
        timeout: 30000, // 30 秒超时
      },
    },
    // 步骤 4: 选择型 UI - 选择处理方式
    {
      id: 'choose',
      name: '选择方式',
      type: 'ui',
      dependencies: ['confirm'],
      ui: {
        componentId: 'choice-dialog',
        mode: UIMode.SELECT,
        data: { message: '请选择处理方式：' },
        options: [
          { id: 'quick', label: '快速处理 - 简化流程' },
          { id: 'full', label: '完整处理 - 详细分析' },
        ],
        timeout: 30000,
      },
    },
    // 步骤 5a: 快速处理（根据选择跳过）
    {
      id: 'quick-process',
      name: '快速处理',
      type: 'tool',
      dependencies: ['choose'],
      tools: [{ toolId: 'quick-process', outputKey: 'processResult' }],
      skipPolicy: {
        condition: (ctx: Context) => {
          const chooseOutput = ctx.getStepOutput('choose') as { selectedOption?: string } | undefined;
          return chooseOutput?.selectedOption !== 'quick';
        },
        defaultOutput: null,
      },
    },
    // 步骤 5b: 完整处理（根据选择跳过）
    {
      id: 'full-process',
      name: '完整处理',
      type: 'tool',
      dependencies: ['choose'],
      tools: [{ toolId: 'full-process', outputKey: 'processResult' }],
      skipPolicy: {
        condition: (ctx: Context) => {
          const chooseOutput = ctx.getStepOutput('choose') as { selectedOption?: string } | undefined;
          return chooseOutput?.selectedOption !== 'full';
        },
        defaultOutput: null,
      },
    },
    // 步骤 6: 生成报告
    {
      id: 'report',
      name: '生成报告',
      type: 'tool',
      dependencies: ['quick-process', 'full-process'],
      tools: [{ toolId: 'generate-report' }],
    },
  ],
};

// ============ 主程序 ============

async function main() {
  // 从命令行参数获取用户选择，默认选择 "full"
  const userChoice = process.argv[2] || 'full';
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         工作流引擎 UI 交互演示 - UI Demo                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`📌 模拟用户选择: ${userChoice === 'quick' ? '快速处理' : '完整处理'}\n`);

  // 1. 创建引擎实例
  const engine = new WorkflowEngine();

  // 2. 注册工具
  engine.registerTool(fetchDataTool);
  engine.registerTool(quickProcessTool);
  engine.registerTool(fullProcessTool);
  engine.registerTool(generateReportTool);

  // 3. 注册 UI 组件
  engine.registerUIComponent(notificationComponent.meta, notificationComponent.renderer);
  engine.registerUIComponent(confirmDialogComponent.meta, confirmDialogComponent.renderer);
  engine.registerUIComponent(choiceDialogComponent.meta, choiceDialogComponent.renderer);

  console.log('✨ 引擎已初始化');
  console.log('   工具: 数据获取, 快速处理, 完整处理, 生成报告');
  console.log('   UI 组件: 通知, 确认对话框, 选择对话框\n');

  // 4. 注册事件监听器
  engine.on(EventType.WORKFLOW_START, () => {
    console.log('🚀 工作流开始执行\n');
  });

  engine.on(EventType.WORKFLOW_COMPLETE, () => {
    console.log('\n🎉 工作流执行完成！');
  });

  engine.on(EventType.WORKFLOW_FAILED, (event: WorkflowEvent) => {
    const payload = event.payload as { error?: string };
    console.log(`\n💥 工作流执行失败: ${payload.error || '未知错误'}`);
  });

  engine.on(EventType.PROGRESS_UPDATE, (event: WorkflowEvent) => {
    const payload = event.payload as ProgressPayload;
    console.log(`  📈 进度: ${payload.completedSteps}/${payload.totalSteps} (${payload.percentage}%)`);
  });

  engine.on(EventType.STEP_SKIP, (event: WorkflowEvent) => {
    const payload = event.payload as { stepId: string; stepName?: string };
    console.log(`  ⏭️ 跳过步骤: ${payload.stepName || payload.stepId}`);
  });

  // 监听 UI 渲染事件，模拟用户交互
  engine.on(EventType.UI_RENDER, async (event: WorkflowEvent) => {
    const payload = event.payload as {
      componentId: string;
      mode: UIMode;
      data?: Record<string, unknown>;
      options?: Array<{ id: string; label: string }>;
    };
    const stepId = event.stepId!;

    // 展示型 UI 不需要用户输入，自动继续
    if (payload.mode === UIMode.DISPLAY) {
      console.log('  ⏳ 展示型 UI，等待自动继续...');
      return;
    }

    // 确认型 UI - 模拟用户确认
    if (payload.mode === UIMode.CONFIRM) {
      console.log('  👆 模拟用户点击「确认」');
      // 延迟一下模拟用户思考
      await delay(500);
      engine.respondToUI(stepId, { rendered: true, userResponse: { confirmed: true } });
      return;
    }

    // 选择型 UI - 模拟用户选择
    if (payload.mode === UIMode.SELECT && payload.options) {
      const selectedOption = userChoice;
      const selectedLabel = payload.options.find(o => o.id === selectedOption)?.label || selectedOption;
      console.log(`  👆 模拟用户选择「${selectedLabel}」`);
      await delay(500);
      engine.respondToUI(stepId, { rendered: true, selectedOption });
    }
  });

  // 5. 加载并执行工作流
  console.log('📋 加载工作流: ' + uiWorkflow.name);
  console.log('   流程: welcome → fetch → confirm → choose → [quick/full] → report\n');
  
  engine.loadWorkflow(uiWorkflow);

  console.log('═'.repeat(60));
  console.log('开始执行...');
  console.log('═'.repeat(60) + '\n');

  const startTime = Date.now();
  const result = await engine.start();
  const duration = Date.now() - startTime;

  // 6. 输出结果
  console.log('\n' + '═'.repeat(60));
  console.log('执行结果');
  console.log('═'.repeat(60));
  
  console.log(`\n状态: ${result.status === WorkflowStatus.COMPLETED ? '✅ 成功' : '❌ 失败'}`);
  console.log(`耗时: ${duration}ms`);

  // 输出最终报告
  const reportOutput = result.context.stepOutputs['report'];
  if (reportOutput) {
    const reportData = (reportOutput as Array<{ result: unknown }>)[0]?.result as {
      title: string;
      method: string;
      result: string;
      timestamp: string;
    };
    
    if (reportData) {
      console.log('\n📄 最终报告:');
      console.log(`   标题: ${reportData.title}`);
      console.log(`   处理方式: ${reportData.method}`);
      console.log(`   结果: ${reportData.result}`);
      console.log(`   时间: ${reportData.timestamp}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
}

// 运行演示
main().catch(console.error);
