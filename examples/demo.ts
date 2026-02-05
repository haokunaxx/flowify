/**
 * 工作流引擎快速演示
 * 
 * 演示功能：
 * 1. 创建工作流定义（包含并行分支）
 * 2. 注册工具
 * 3. 监听事件
 * 4. 执行工作流
 */

import {
  WorkflowEngine,
  WorkflowDefinition,
  StepStatus,
  WorkflowStatus,
  ToolMode,
  EventType,
  WorkflowEvent,
  ProgressPayload,
  StepBarPayload,
  Context,
} from '../src';

// ============ 辅助函数 ============

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatStatus(status: StepStatus): string {
  const icons: Record<StepStatus, string> = {
    [StepStatus.PENDING]: '⏳',
    [StepStatus.RUNNING]: '🔄',
    [StepStatus.WAITING_INPUT]: '⏸️',
    [StepStatus.SUCCESS]: '✅',
    [StepStatus.FAILED]: '❌',
    [StepStatus.SKIPPED]: '⏭️',
  };
  return icons[status] || '❓';
}

// ============ 工具定义 ============

// 模拟数据获取工具
const fetchDataTool = {
  meta: {
    id: 'fetch-data',
    name: '数据获取',
    description: '从远程获取数据',
    mode: ToolMode.SYNC,
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      const targetUrl = context.getGlobal('dataUrl') || 'https://api.example.com/data';
      console.log(`  📡 正在获取数据: ${targetUrl}`);
      await delay(300);
      const data = {
        items: ['苹果', '香蕉', '橙子'],
        source: targetUrl,
        timestamp: Date.now(),
      };
      // 存储到上下文供后续步骤使用
      context.setGlobal('rawData', data);
      return data;
    },
  },
};

// 模拟数据处理工具
const processDataTool = {
  meta: {
    id: 'process-data',
    name: '数据处理',
    description: '处理和转换数据',
    mode: ToolMode.SYNC,
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      // 从上下文获取原始数据
      const rawData = context.getGlobal('rawData') as { items: string[] } | undefined;
      if (!rawData) {
        throw new Error('未找到原始数据');
      }
      console.log(`  ⚙️ 正在处理 ${rawData.items.length} 条数据...`, Date.now());
      await delay(200);
      const processed = {
        items: rawData.items.map((item: string) => `【${item}】`),
        count: rawData.items.length,
        processedAt: Date.now(),
      };
      context.setGlobal('processedData', processed);
      return processed;
    },
  },
};

// 模拟数据验证工具
const validateDataTool = {
  meta: {
    id: 'validate-data',
    name: '数据验证',
    description: '验证数据完整性',
    mode: ToolMode.SYNC,
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      const rawData = context.getGlobal('rawData') as { items: string[] } | undefined;
      if (!rawData) {
        throw new Error('未找到原始数据');
      }
      console.log(`  ✅ 正在验证 ${rawData.items.length} 条数据...`, Date.now());
      await delay(150);
      const validation = {
        valid: true,
        itemCount: rawData.items.length,
        checksum: Math.random().toString(36).substring(7),
      };
      context.setGlobal('validationResult', validation);
      return validation;
    },
  },
};

// 模拟报告生成工具
const generateReportTool = {
  meta: {
    id: 'generate-report',
    name: '报告生成',
    description: '生成处理报告',
    mode: ToolMode.SYNC,
  },
  executor: {
    execute: async (params: unknown, context: Context) => {
      const processedData = context.getGlobal('processedData') as { items: string[]; count: number } | undefined;
      const validationResult = context.getGlobal('validationResult') as { valid: boolean; checksum: string } | undefined;
      
      if (!processedData || !validationResult) {
        throw new Error('缺少必要的前置数据');
      }
      
      console.log(`  📊 正在生成报告...`);
      await delay(200);
      
      return {
        title: '数据处理报告',
        summary: {
          processedCount: processedData.count,
          items: processedData.items,
          validationStatus: validationResult.valid ? '✓ 通过' : '✗ 失败',
          checksum: validationResult.checksum,
        },
        generatedAt: new Date().toLocaleString('zh-CN'),
      };
    },
  },
};

// ============ 工作流定义 ============

/**
 * 创建数据处理工作流
 * 
 * 工作流结构：
 *           ┌→ process (处理) ─┐
 * fetch ────┤                  ├→ report (报告)
 *           └→ validate (验证) ─┘
 */
const dataProcessingWorkflow: WorkflowDefinition = {
  id: 'data-processing',
  name: '数据处理工作流',
  description: '演示并行分支的数据处理流程',
  steps: [
    {
      id: 'fetch',
      name: '获取数据',
      type: 'tool',
      tools: [{ toolId: 'fetch-data' }],
    },
    {
      id: 'process',
      name: '处理数据',
      type: 'tool',
      dependencies: ['fetch'],
      tools: [{ toolId: 'process-data' }],
    },
    {
      id: 'validate',
      name: '验证数据',
      type: 'tool',
      dependencies: ['fetch'],
      tools: [{ toolId: 'validate-data' }],
    },
    {
      id: 'report',
      name: '生成报告',
      type: 'tool',
      dependencies: ['process', 'validate'],
      tools: [{ toolId: 'generate-report' }],
    },
  ],
};

// ============ 主程序 ============

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           工作流引擎演示 - Workflow Engine Demo            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 1. 创建引擎实例
  const engine = new WorkflowEngine();
  console.log('✨ 引擎实例已创建\n');

  // 2. 注册工具
  console.log('📦 注册工具...');
  engine.registerTool(fetchDataTool);
  engine.registerTool(processDataTool);
  engine.registerTool(validateDataTool);
  engine.registerTool(generateReportTool);
  
  const tools = engine.getRegisteredTools();
  console.log(`   已注册 ${tools.length} 个工具: ${tools.map(t => t.name).join(', ')}\n`);

  // 3. 注册事件监听器
  console.log('🎧 注册事件监听器...\n');
  
  // 监听工作流生命周期事件
  engine.on(EventType.WORKFLOW_START, (event: WorkflowEvent) => {
    console.log('🚀 工作流开始执行');
    console.log(`   工作流 ID: ${event.workflowId}\n`);
  });

  engine.on(EventType.WORKFLOW_COMPLETE, () => {
    console.log('\n🎉 工作流执行完成！');
  });

  engine.on(EventType.WORKFLOW_FAILED, (event: WorkflowEvent) => {
    const payload = event.payload as { error?: string };
    console.log(`\n💥 工作流执行失败: ${payload.error || '未知错误'}`);
  });

  // 监听进度更新
  engine.on(EventType.PROGRESS_UPDATE, (event: WorkflowEvent) => {
    const payload = event.payload as ProgressPayload;
    const progress = Math.round(payload.percentage);
    const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
    console.log(`   📈 进度: [${bar}] ${progress}% (${payload.completedSteps}/${payload.totalSteps})`);
  });

  // 4. 加载工作流
  console.log('📋 加载工作流定义...');
  engine.loadWorkflow(dataProcessingWorkflow);
  console.log(`   工作流: ${dataProcessingWorkflow.name}`);
  console.log(`   步骤数: ${dataProcessingWorkflow.steps.length}`);
  console.log(`   结构: fetch → [process, validate] → report\n`);

  // 5. 执行工作流
  console.log('═'.repeat(60));
  console.log('开始执行工作流...');
  console.log('═'.repeat(60) + '\n');

  const startTime = Date.now();
  const result = await engine.start({
    dataUrl: 'https://api.example.com/fruits',
  });
  const duration = Date.now() - startTime;

  // 6. 输出结果
  console.log('\n' + '═'.repeat(60));
  console.log('执行结果');
  console.log('═'.repeat(60));
  
  console.log(`\n状态: ${result.status === WorkflowStatus.COMPLETED ? '✅ 成功' : '❌ 失败'}`);
  console.log(`耗时: ${duration}ms`);
  
  if (result.error) {
    console.log(`错误: ${result.error.message}`);
  }

  // 输出最终报告
  const reportOutput = result.context.stepOutputs['report'];
  if (reportOutput) {
    const reportData = (reportOutput as Array<{ result: unknown }>)[0]?.result as {
      title: string;
      summary: {
        processedCount: number;
        items: string[];
        validationStatus: string;
        checksum: string;
      };
      generatedAt: string;
    };
    
    if (reportData) {
      console.log('\n📄 最终报告:');
      console.log(`   标题: ${reportData.title}`);
      console.log(`   处理数量: ${reportData.summary.processedCount}`);
      console.log(`   处理结果: ${reportData.summary.items.join(', ')}`);
      console.log(`   验证状态: ${reportData.summary.validationStatus}`);
      console.log(`   校验码: ${reportData.summary.checksum}`);
      console.log(`   生成时间: ${reportData.generatedAt}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('演示结束');
  console.log('═'.repeat(60));
}

// 运行演示
main().catch(console.error);
