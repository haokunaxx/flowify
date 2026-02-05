/**
 * Editor 包内置工具和 UI 组件演示
 * 
 * 演示功能：
 * 1. 使用 @flowify/editor 提供的内置工具（Echo、Delay）
 * 2. 展示工具注册和执行流程
 */

import {
  WorkflowEngine,
  WorkflowDefinition,
  WorkflowStatus,
  EventType,
  WorkflowEvent,
  ProgressPayload,
} from '@flowify/engine';

import {
  echoTool,
  delayTool,
  builtinTools,
} from '@flowify/editor';

// ============ 工作流定义 ============

/**
 * 使用内置工具的工作流
 * 
 * 流程：
 * 1. Echo - 回显欢迎消息
 * 2. Delay - 延时 500ms
 * 3. Echo - 回显完成消息
 */
const editorDemoWorkflow: WorkflowDefinition = {
  id: 'editor-demo',
  name: 'Editor 内置工具演示',
  description: '演示 @flowify/editor 提供的内置工具',
  steps: [
    {
      id: 'welcome',
      name: '欢迎消息',
      type: 'tool',
      tools: [{ toolId: 'echo', params: { message: '🎉 欢迎使用 Flowify Editor！' } }],
    },
    {
      id: 'wait',
      name: '等待处理',
      type: 'tool',
      dependencies: ['welcome'],
      tools: [{ toolId: 'delay', params: { ms: 500 } }],
    },
    {
      id: 'complete',
      name: '完成消息',
      type: 'tool',
      dependencies: ['wait'],
      tools: [{ toolId: 'echo', params: { message: '✅ 工作流执行完成！' } }],
    },
  ],
};

// ============ 主程序 ============

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Flowify Editor 内置工具演示 - Editor Demo            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 1. 创建引擎实例
  const engine = new WorkflowEngine();
  console.log('✨ 引擎实例已创建\n');

  // 2. 注册内置工具
  console.log('📦 注册内置工具...');
  
  // 方式一：逐个注册
  engine.registerTool(echoTool);
  engine.registerTool(delayTool);
  
  // 方式二：批量注册（注释掉，展示两种方式）
  // builtinTools.forEach(tool => engine.registerTool(tool));
  
  const tools = engine.getRegisteredTools();
  console.log(`   已注册 ${tools.length} 个工具:`);
  tools.forEach(tool => {
    console.log(`   - ${tool.name} (${tool.id}): ${tool.description || '无描述'}`);
  });
  console.log();

  // 3. 注册事件监听器
  engine.on(EventType.WORKFLOW_START, () => {
    console.log('🚀 工作流开始执行\n');
  });

  engine.on(EventType.WORKFLOW_COMPLETE, () => {
    console.log('\n🎉 工作流执行完成！');
  });

  engine.on(EventType.PROGRESS_UPDATE, (event: WorkflowEvent) => {
    const payload = event.payload as ProgressPayload;
    const progress = Math.round(payload.percentage);
    console.log(`   📈 进度: ${progress}% (${payload.completedSteps}/${payload.totalSteps})`);
  });

  // 4. 加载并执行工作流
  console.log('📋 加载工作流: ' + editorDemoWorkflow.name);
  console.log('   流程: welcome → wait → complete\n');
  
  engine.loadWorkflow(editorDemoWorkflow);

  console.log('═'.repeat(60));
  console.log('开始执行...');
  console.log('═'.repeat(60) + '\n');

  const startTime = Date.now();
  const result = await engine.start();
  const duration = Date.now() - startTime;

  // 5. 输出结果
  console.log('\n' + '═'.repeat(60));
  console.log('执行结果');
  console.log('═'.repeat(60));
  
  console.log(`\n状态: ${result.status === WorkflowStatus.COMPLETED ? '✅ 成功' : '❌ 失败'}`);
  console.log(`耗时: ${duration}ms`);

  // 输出各步骤结果
  console.log('\n📄 步骤输出:');
  for (const [stepId, output] of Object.entries(result.context.stepOutputs)) {
    const stepOutput = (output as Array<{ result: unknown }>)[0]?.result;
    console.log(`   ${stepId}: ${JSON.stringify(stepOutput)}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('演示结束');
  console.log('═'.repeat(60));
}

// 运行演示
main().catch(console.error);
