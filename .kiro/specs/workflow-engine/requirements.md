# 需求文档

## 简介

本文档定义了一个通用工作流引擎的需求规格。该引擎支持单分支和多分支（DAG）工作流执行，通过事件机制与外部系统交互，支持异步等待、上下文管理、重试和跳过策略等核心功能。引擎设计需要考虑与可视化流程编排器的对接，以及灵活的 UI 组件和工具注入机制。

## 术语表

- **Workflow_Engine**: 工作流引擎，负责解析、调度和执行工作流定义
- **Workflow**: 工作流，由一系列步骤组成的有向无环图（DAG）
- **Step**: 步骤，工作流中的最小执行单元
- **Context**: 上下文，存储工作流执行过程中的状态和数据
- **Event**: 事件，用于引擎与外部系统通信的消息
- **DAG**: 有向无环图（Directed Acyclic Graph），表示步骤之间的依赖关系
- **Executor**: 执行器，负责执行具体步骤的组件
- **Retry_Policy**: 重试策略，定义步骤失败后的重试行为
- **Skip_Policy**: 跳过策略，定义步骤在特定条件下的跳过行为
- **Hook**: 钩子，在步骤执行前后插入的扩展逻辑
- **UI_Component**: UI 组件，用于渲染用户交互界面的组件
- **Tool**: 工具，可被步骤调用的外部能力
- **Tool_Mode**: 工具执行模式，定义工具的执行方式（同步/异步）
- **Step_Bar**: 步骤条，可视化展示工作流执行进度的 UI 组件
- **UI_Mode**: UI 模式，定义 UI 组件的交互方式（展示型/确认型/选择型）

## 需求

### 需求 1：工作流定义与解析

**用户故事：** 作为开发者，我希望能够定义工作流结构，以便引擎能够理解和执行我的业务流程。

#### 验收标准

1. THE Workflow_Engine SHALL 支持定义包含多个步骤的工作流
2. THE Workflow_Engine SHALL 支持定义步骤之间的依赖关系形成 DAG 结构
3. WHEN 解析工作流定义时，THE Workflow_Engine SHALL 验证 DAG 中不存在循环依赖
4. IF 工作流定义包含循环依赖，THEN THE Workflow_Engine SHALL 返回明确的错误信息
5. THE Workflow_Engine SHALL 支持单分支（线性）工作流定义
6. THE Workflow_Engine SHALL 支持多分支（并行）工作流定义

### 需求 2：工作流执行调度

**用户故事：** 作为开发者，我希望引擎能够按照正确的顺序执行工作流步骤，以便保证业务逻辑的正确性。

#### 验收标准

1. WHEN 执行工作流时，THE Workflow_Engine SHALL 按照 DAG 拓扑顺序调度步骤
2. WHEN 一个步骤的所有前置依赖完成时，THE Workflow_Engine SHALL 将该步骤标记为可执行
3. WHEN 存在多个可执行步骤时，THE Workflow_Engine SHALL 支持并行执行这些步骤
4. WHEN 某个步骤执行失败时，THE Workflow_Engine SHALL 阻止其后续依赖步骤的执行
5. THE Workflow_Engine SHALL 维护每个步骤的执行状态（待执行、执行中、成功、失败、跳过）

### 需求 3：事件与外部交互

**用户故事：** 作为开发者，我希望工作流能够与外部系统交互，以便实现工具调用和用户界面交互。

#### 验收标准

1. THE Workflow_Engine SHALL 通过事件机制向外部系统发送通知
2. WHEN 步骤需要调用外部工具时，THE Workflow_Engine SHALL 发出工具调用事件
3. WHEN 步骤需要用户输入时，THE Workflow_Engine SHALL 发出 UI 交互事件并暂停执行
4. WHEN 收到外部系统的响应事件时，THE Workflow_Engine SHALL 恢复暂停的步骤执行
5. THE Workflow_Engine SHALL 支持注册多个事件监听器
6. THE Event SHALL 包含事件类型、来源步骤、时间戳和负载数据

### 需求 4：异步等待机制

**用户故事：** 作为开发者，我希望工作流能够异步等待外部操作完成，以便支持长时间运行的任务。

#### 验收标准

1. WHEN 步骤进入等待状态时，THE Workflow_Engine SHALL 释放执行资源而不阻塞其他步骤
2. THE Workflow_Engine SHALL 支持设置等待超时时间
3. IF 等待超时，THEN THE Workflow_Engine SHALL 触发超时事件并执行配置的超时处理策略
4. WHEN 等待的外部操作完成时，THE Workflow_Engine SHALL 能够恢复步骤执行
5. THE Workflow_Engine SHALL 支持取消正在等待的步骤

### 需求 5：执行进度暴露

**用户故事：** 作为开发者，我希望能够实时了解工作流的执行进度，以便监控和展示执行状态。

#### 验收标准

1. THE Workflow_Engine SHALL 在步骤状态变化时发出进度事件
2. THE Progress_Event SHALL 包含当前步骤、总步骤数、已完成步骤数和执行百分比
3. WHEN 工作流开始执行时，THE Workflow_Engine SHALL 发出工作流开始事件
4. WHEN 工作流执行完成时，THE Workflow_Engine SHALL 发出工作流完成事件
5. WHEN 工作流执行失败时，THE Workflow_Engine SHALL 发出工作流失败事件并包含错误信息
6. THE Workflow_Engine SHALL 支持查询当前工作流的执行快照

### 需求 6：上下文管理

**用户故事：** 作为开发者，我希望步骤之间能够共享数据，以便后续步骤能够使用前置步骤的执行结果。

#### 验收标准

1. THE Workflow_Engine SHALL 为每个工作流实例维护独立的执行上下文
2. WHEN 步骤执行完成时，THE Workflow_Engine SHALL 将步骤输出存储到上下文中
3. WHEN 步骤开始执行时，THE Workflow_Engine SHALL 向步骤提供其依赖步骤的输出数据
4. THE Context SHALL 支持按步骤 ID 查询特定步骤的输出
5. THE Context SHALL 支持存储和读取全局变量
6. THE Workflow_Engine SHALL 在工作流完成后保留上下文数据供查询

### 需求 7：重试策略

**用户故事：** 作为开发者，我希望能够配置步骤的重试行为，以便处理临时性故障。

#### 验收标准

1. THE Workflow_Engine SHALL 支持为步骤配置重试策略
2. THE Retry_Policy SHALL 支持配置最大重试次数
3. THE Retry_Policy SHALL 支持配置重试间隔时间
4. THE Retry_Policy SHALL 支持配置指数退避策略
5. WHEN 步骤执行失败且未超过重试次数时，THE Workflow_Engine SHALL 按照重试策略重新执行步骤
6. WHEN 步骤重试时，THE Workflow_Engine SHALL 发出重试事件
7. IF 重试次数耗尽仍然失败，THEN THE Workflow_Engine SHALL 将步骤标记为最终失败

### 需求 8：跳过策略

**用户故事：** 作为开发者，我希望能够配置步骤的跳过条件，以便在特定情况下跳过不必要的步骤。

#### 验收标准

1. THE Workflow_Engine SHALL 支持为步骤配置跳过策略
2. THE Skip_Policy SHALL 支持基于条件表达式的跳过判断
3. THE Skip_Policy SHALL 支持基于前置步骤结果的跳过判断
4. WHEN 步骤满足跳过条件时，THE Workflow_Engine SHALL 将步骤标记为跳过状态
5. WHEN 步骤被跳过时，THE Workflow_Engine SHALL 发出跳过事件
6. WHEN 步骤被跳过时，THE Workflow_Engine SHALL 继续执行其后续依赖步骤
7. THE Skip_Policy SHALL 支持配置跳过时的默认输出值


### 需求 9：Hook 扩展机制

**用户故事：** 作为开发者，我希望能够在步骤执行前后插入自定义逻辑，以便实现面向切面的扩展能力。

#### 验收标准

1. THE Workflow_Engine SHALL 支持为步骤配置 beforeHook 和 afterHook
2. WHEN 步骤开始执行前，THE Workflow_Engine SHALL 先执行所有配置的 beforeHook
3. WHEN 步骤执行完成后，THE Workflow_Engine SHALL 执行所有配置的 afterHook
4. THE Hook SHALL 能够访问和修改步骤的输入参数
5. THE Hook SHALL 能够访问步骤的执行结果（仅 afterHook）
6. IF beforeHook 执行失败，THEN THE Workflow_Engine SHALL 阻止步骤执行并触发错误事件
7. THE Workflow_Engine SHALL 支持全局 Hook 和步骤级 Hook
8. WHEN 同时存在全局 Hook 和步骤级 Hook 时，THE Workflow_Engine SHALL 按照全局 beforeHook → 步骤 beforeHook → 步骤执行 → 步骤 afterHook → 全局 afterHook 的顺序执行

### 需求 10：UI 组件系统

**用户故事：** 作为开发者，我希望工作流能够渲染不同类型的 UI 组件，以便实现丰富的用户交互体验。

#### 验收标准

1. THE Workflow_Engine SHALL 支持注册 UI 组件
2. THE UI_Component SHALL 支持三种交互模式：展示型（display）、确认型（confirm）、选择型（select）
3. WHEN 步骤需要展示型 UI 时，THE Workflow_Engine SHALL 渲染 UI 并在指定时间后自动继续执行
4. WHEN 步骤需要确认型 UI 时，THE Workflow_Engine SHALL 渲染 UI 并等待用户确认后继续执行
5. WHEN 步骤需要选择型 UI 时，THE Workflow_Engine SHALL 渲染 UI 并根据用户选择决定后续执行路径
6. THE Workflow_Engine SHALL 发出 UI 渲染事件，包含组件类型、交互模式和渲染数据
7. THE Workflow_Engine SHALL 支持 UI 组件的动态注册和卸载

### 需求 11：工具注入系统

**用户故事：** 作为开发者，我希望能够灵活地注入和管理工具，以便步骤能够调用各种外部能力。

#### 验收标准

1. THE Workflow_Engine SHALL 提供工具注册接口
2. THE Tool SHALL 通过唯一标识符进行注册和调用
3. THE Tool SHALL 支持两种执行模式：同步（sync）、异步（async）
4. WHEN 步骤调用同步工具时，THE Workflow_Engine SHALL 等待工具执行完成后继续
5. WHEN 步骤调用异步工具时，THE Workflow_Engine SHALL 发出工具调用事件并等待外部响应
6. THE Workflow_Engine SHALL 支持工具的依赖注入
7. WHEN 步骤调用工具时，THE Workflow_Engine SHALL 通过工具标识符查找并执行对应工具
8. IF 调用的工具未注册，THEN THE Workflow_Engine SHALL 返回明确的错误信息
9. THE Workflow_Engine SHALL 支持工具的动态注册和卸载
10. THE Tool SHALL 能够访问工作流上下文
11. THE Workflow_Engine SHALL 支持工具执行的超时配置
12. THE Tool SHALL 支持定义输入参数 Schema 和输出结果 Schema
13. WHEN 工具执行前，THE Workflow_Engine SHALL 验证输入参数符合 Schema 定义
14. THE Workflow_Engine SHALL 发出工具执行事件，包含工具标识符、输入参数、执行状态和结果

#### 待定功能（低优先级）

1. THE Tool MAY 支持流式（stream）执行模式
2. WHEN 步骤调用流式工具时，THE Workflow_Engine MAY 支持接收多次中间结果直到完成

### 需求 12：可视化编排支持

**用户故事：** 作为开发者，我希望引擎能够支持可视化编排器的对接，以便实现图形化的工作流设计。

#### 验收标准

1. THE Workflow_Engine SHALL 提供工作流定义的序列化和反序列化能力
2. THE Workflow_Engine SHALL 支持导出工作流定义为 JSON 格式
3. THE Workflow_Engine SHALL 支持从 JSON 格式导入工作流定义
4. THE Workflow_Engine SHALL 提供获取所有已注册步骤类型的接口
5. THE Workflow_Engine SHALL 提供获取所有已注册工具的接口
6. THE Workflow_Engine SHALL 提供获取所有已注册 UI 组件的接口
7. THE Workflow_Engine SHALL 支持工作流定义的验证接口
8. THE Workflow_Engine SHALL 提供步骤元数据（输入输出类型、描述等）查询接口

### 需求 13：步骤条状态同步

**用户故事：** 作为开发者，我希望能够实时同步步骤条的状态，以便用户能够直观地了解工作流执行进度。

#### 验收标准

1. THE Workflow_Engine SHALL 发出步骤条状态更新事件
2. THE Step_Bar_Event SHALL 包含所有步骤的当前状态列表
3. THE Step_Bar_Event SHALL 包含当前活动步骤的标识
4. WHEN 步骤状态变化时，THE Workflow_Engine SHALL 立即发出步骤条状态更新事件
5. THE Step_Status SHALL 支持以下状态：待执行（pending）、执行中（running）、等待输入（waiting_input）、成功（success）、失败（failed）、跳过（skipped）
6. THE Workflow_Engine SHALL 支持查询当前步骤条状态快照
