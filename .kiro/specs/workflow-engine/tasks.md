# 实现计划：工作流引擎

## 概述

本实现计划将工作流引擎设计分解为可执行的编码任务。采用 TypeScript 实现，使用 Vitest 进行单元测试，fast-check 进行属性测试。

## 任务列表

- [-] 1. 项目初始化和核心类型定义
  - [x] 1.1 初始化 TypeScript 项目结构
    - 创建 `src/` 目录结构：`core/`、`scheduler/`、`executor/`、`context/`、`events/`、`registry/`、`hooks/`
    - 配置 `tsconfig.json`、`package.json`
    - 安装依赖：`vitest`、`fast-check`
    - _Requirements: 12.1_
  - [x] 1.2 定义核心类型和枚举
    - 实现 `StepStatus`、`WorkflowStatus`、`UIMode`、`ToolMode` 枚举
    - 实现 `WorkflowDefinition`、`StepDefinition`、`RetryPolicy`、`SkipPolicy` 接口
    - _Requirements: 1.1, 2.5_
  - [x] 1.3 定义错误类型层次
    - 实现 `WorkflowError` 基类
    - 实现 `ValidationError`、`CyclicDependencyError`、`StepExecutionError` 等子类
    - _Requirements: 1.4, 11.8_

- [x] 2. 实现上下文管理模块
  - [x] 2.1 实现 Context 类
    - 实现 `getStepOutput`、`setStepOutput` 方法
    - 实现 `getGlobal`、`setGlobal` 方法
    - 实现 `snapshot` 方法
    - _Requirements: 6.1, 6.2, 6.4, 6.5_
  - [ ]* 2.2 编写 Context 属性测试
    - **Property 8: 上下文实例隔离**
    - **Property 10: 全局变量读写一致性**
    - **Validates: Requirements 6.1, 6.5**

- [-] 3. 实现事件系统模块
  - [x] 3.1 实现 EventEmitter 类
    - 实现 `on`、`off`、`emit` 方法
    - 实现事件类型枚举 `EventType`
    - 实现 `WorkflowEvent` 接口
    - _Requirements: 3.1, 3.5, 3.6_
  - [ ]* 3.2 编写 EventEmitter 属性测试
    - **Property 5: 事件结构完整性**
    - **Property 6: 事件监听器广播**
    - **Validates: Requirements 3.5, 3.6**

- [x] 4. Checkpoint - 确保基础模块测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 实现调度器模块
  - [x] 5.1 实现 DAGBuilder 类
    - 实现 `build` 方法：从 WorkflowDefinition 构建 DAG
    - 实现入度和出度计算
    - _Requirements: 1.1, 1.2, 1.5, 1.6_
  - [x] 5.2 实现循环依赖检测
    - 实现 `detectCycle` 方法（Kahn 算法）
    - 实现 `findCyclePath` 方法返回循环路径
    - _Requirements: 1.3, 1.4_
  - [ ]* 5.3 编写 DAG 验证属性测试
    - **Property 1: DAG 验证与循环检测**
    - **Validates: Requirements 1.3, 1.4**
  - [x] 5.4 实现 Scheduler 类
    - 实现 `parse` 方法
    - 实现 `validate` 方法
    - 实现 `getReadySteps` 方法
    - 实现 `topologicalSort` 方法
    - _Requirements: 2.1, 2.2_
  - [ ]* 5.5 编写调度器属性测试
    - **Property 2: 拓扑排序正确性**
    - **Property 3: 步骤调度依赖完整性**
    - **Validates: Requirements 2.1, 2.2**

- [x] 6. 实现注册表模块
  - [x] 6.1 实现 ToolRegistry 类
    - 实现 `register`、`unregister`、`get`、`getAll` 方法
    - 实现工具元数据存储
    - _Requirements: 11.1, 11.2, 11.9_
  - [x] 6.2 实现 UIRegistry 类
    - 实现 `register`、`unregister`、`get`、`getAll` 方法
    - 实现 UI 组件元数据存储
    - _Requirements: 10.1, 10.7_
  - [ ]* 6.3 编写注册表属性测试
    - **Property 19: 工具注册查找一致性**
    - **Property 22: 注册表查询完整性**
    - **Validates: Requirements 11.2, 11.8, 12.4, 12.5, 12.6**

- [x] 7. Checkpoint - 确保调度器和注册表测试通过
  - 确保所有测试通过，如有问题请询问用户

- [-] 8. 实现 Hook 管理模块
  - [x] 8.1 实现 HookManager 类
    - 实现全局 Hook 注册：`addGlobalHook`、`removeGlobalHook`
    - 实现步骤级 Hook 管理
    - 实现 Hook 执行顺序控制
    - _Requirements: 9.1, 9.7, 9.8_
  - [x] 8.2 实现 HookContext 和 Hook 执行逻辑
    - 实现 `modifyInput` 功能
    - 实现 beforeHook 失败阻断逻辑
    - _Requirements: 9.4, 9.5, 9.6_
  - [ ]* 8.3 编写 Hook 属性测试
    - **Property 16: Hook 执行顺序**
    - **Property 17: Hook 输入修改传递**
    - **Property 18: beforeHook 失败阻断**
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.6, 9.7, 9.8**

- [x] 9. 实现执行器模块
  - [x] 9.1 实现重试策略逻辑
    - 实现重试次数控制
    - 实现重试间隔计算
    - 实现指数退避算法
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ]* 9.2 编写重试策略属性测试
    - **Property 11: 重试次数限制**
    - **Property 12: 指数退避间隔**
    - **Validates: Requirements 7.2, 7.4, 7.5, 7.7**
  - [x] 9.3 实现跳过策略逻辑
    - 实现条件表达式求值
    - 实现基于前置步骤结果的跳过判断
    - 实现默认输出值设置
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_
  - [ ]* 9.4 编写跳过策略属性测试
    - **Property 13: 跳过条件判断正确性**
    - **Property 14: 跳过后继续执行**
    - **Property 15: 跳过默认输出**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.6, 8.7**
  - [x] 9.5 实现 Executor 类
    - 实现 `executeStep` 方法
    - 集成重试策略、跳过策略、Hook 执行
    - 实现 `cancelStep` 方法
    - _Requirements: 2.4, 7.5, 7.6, 7.7, 8.4, 8.5, 8.6_
  - [ ]* 9.6 编写执行器属性测试
    - **Property 4: 失败传播阻断**
    - **Validates: Requirements 2.4**

- [x] 10. Checkpoint - 确保执行器模块测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 11. 实现工具调用系统
  - [x] 11.1 实现同步工具调用
    - 实现工具查找和执行
    - 实现输入参数 Schema 验证
    - 实现超时控制
    - _Requirements: 11.4, 11.7, 11.11, 11.13_
  - [x] 11.2 实现异步工具调用
    - 实现工具调用事件发出
    - 实现等待外部响应机制
    - 实现 `respondToTool` 方法
    - _Requirements: 11.5, 11.14_
  - [ ]* 11.3 编写工具调用属性测试
    - **Property 20: 工具 Schema 验证**
    - **Validates: Requirements 11.13**

- [x] 12. 实现 UI 交互系统
  - [x] 12.1 实现展示型 UI 处理
    - 实现 UI 渲染事件发出
    - 实现自动继续计时器
    - _Requirements: 10.3, 10.6_
  - [x] 12.2 实现确认型 UI 处理
    - 实现等待用户确认机制
    - 实现 `respondToUI` 方法
    - _Requirements: 10.4_
  - [x] 12.3 实现选择型 UI 处理
    - 实现选项渲染
    - 实现根据选择决定执行路径
    - _Requirements: 10.5_

- [x] 13. 实现异步等待机制
  - [x] 13.1 实现等待状态管理
    - 实现步骤等待状态标记
    - 实现等待信息存储
    - _Requirements: 4.1_
  - [x] 13.2 实现超时处理
    - 实现超时计时器
    - 实现超时事件触发
    - _Requirements: 4.2, 4.3_
  - [x] 13.3 实现等待恢复和取消
    - 实现恢复步骤执行
    - 实现取消等待步骤
    - _Requirements: 4.4, 4.5_
  - [ ]* 13.4 编写异步等待属性测试
    - **Property 7: 异步等待非阻塞**
    - **Validates: Requirements 4.1**

- [x] 14. Checkpoint - 确保工具和 UI 系统测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 15. 实现进度和状态暴露
  - [x] 15.1 实现进度事件发出
    - 实现步骤状态变化时发出进度事件
    - 实现进度百分比计算
    - _Requirements: 5.1, 5.2_
  - [x] 15.2 实现工作流生命周期事件
    - 实现开始、完成、失败事件
    - _Requirements: 5.3, 5.4, 5.5_
  - [x] 15.3 实现步骤条状态同步
    - 实现步骤条状态更新事件
    - 实现状态快照查询
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_
  - [ ]* 15.4 编写进度和状态属性测试
    - **Property 23: 步骤条状态同步**
    - **Property 24: 进度事件准确性**
    - **Property 25: 工作流生命周期事件**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 13.1, 13.2, 13.3, 13.4**

- [x] 16. 实现上下文数据流
  - [x] 16.1 实现步骤输出存储
    - 步骤完成后自动存储输出到上下文
    - _Requirements: 6.2_
  - [x] 16.2 实现依赖步骤输出注入
    - 步骤执行时提供依赖步骤的输出数据
    - _Requirements: 6.3_
  - [x] 16.3 实现上下文数据保留
    - 工作流完成后保留上下文数据
    - _Requirements: 6.6_
  - [ ]* 16.4 编写上下文数据流属性测试
    - **Property 9: 上下文数据流正确性**
    - **Validates: Requirements 6.2, 6.3, 6.4**

- [x] 17. 实现 WorkflowEngine 主类
  - [x] 17.1 实现引擎初始化和工作流加载
    - 实现 `loadWorkflow` 方法
    - 集成 Scheduler、Executor、Context、EventEmitter
    - _Requirements: 1.1_
  - [x] 17.2 实现工作流执行控制
    - 实现 `start`、`pause`、`resume`、`cancel` 方法
    - 实现主执行循环
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 17.3 实现查询接口
    - 实现 `getStatus`、`getContext`、`getStepBarState` 方法
    - _Requirements: 5.6, 13.6_

- [x] 18. Checkpoint - 确保引擎核心功能测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 19. 实现序列化和可视化支持
  - [x] 19.1 实现工作流定义序列化
    - 实现 `exportDefinition` 方法（JSON 导出）
    - 实现 `importDefinition` 方法（JSON 导入）
    - _Requirements: 12.1, 12.2, 12.3_
  - [ ]* 19.2 编写序列化属性测试
    - **Property 21: 工作流定义序列化 Round-Trip**
    - **Validates: Requirements 12.1, 12.2, 12.3**
  - [x] 19.3 实现元数据查询接口
    - 实现 `getRegisteredTools` 方法
    - 实现 `getRegisteredUIComponents` 方法
    - 实现工作流定义验证接口
    - _Requirements: 12.4, 12.5, 12.6, 12.7, 12.8_

- [x] 20. 最终 Checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 确保所有属性测试通过
  - 如有问题请询问用户

## 备注

- 标记 `*` 的任务为可选测试任务，可根据时间情况决定是否实现
- 每个属性测试需要运行至少 100 次迭代
- 属性测试需要在注释中标注对应的设计文档属性编号
