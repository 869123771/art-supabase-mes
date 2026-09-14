<template>
  <ArtPermissionGuard :permission="`${routeName}:View`" :resource-name="title">
    <div class="manufacturing-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="MANUFACTURING EXECUTION"
        :title="title"
        :description="description"
        :icon="icon"
        :tags="workspaceTags"
        :metrics="metrics"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>

      <ArtTableQuery
        :key="routeName"
        ref="tableRef"
        v-model="table.search"
        :api-fn="fetchRows"
        :immediate="false"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 82, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          rowClassName: tableRowClassName,
          emptyText: `暂无${title}`,
          emptyDescription: emptyDescription
        }"
        focusable
      >
        <template #selection-bar="{ selectedRows, selectedCount, clearSelection }">
          <div class="manufacturing-page__selection-bar" role="region" aria-label="批量操作">
            <div class="manufacturing-page__selection-summary" aria-live="polite">
              <ArtSvgIcon icon="ri:checkbox-circle-line" aria-hidden="true" />
              <span
                >已选择 <strong>{{ selectedCount }}</strong> 项</span
              >
            </div>
            <span class="manufacturing-page__selection-divider" aria-hidden="true" />

            <template v-if="isWorkOrder">
              <ElButton
                v-auth="'MesWorkOrder:Copy'"
                type="primary"
                plain
                :disabled="selectedCount !== 1 || batchBusy"
                @click="handleCopySelected(selectedRows as MesWorkOrder[], clearSelection)"
              >
                <ArtSvgIcon icon="ri:file-copy-2-line" />
                复制
              </ElButton>
              <ElDropdown
                trigger="click"
                :disabled="batchBusy || !visibleBatchCommands.length"
                @command="(command) => handleBatchCommand(String(command), selectedRows as MesWorkOrder[], clearSelection)"
              >
                <ElButton type="primary" :loading="batchBusy">
                  <ArtSvgIcon icon="ri:function-add-line" />
                  批量操作
                  <ArtSvgIcon icon="ri:arrow-down-s-line" />
                </ElButton>
                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem
                      v-for="item in visibleBatchCommands"
                      :key="item.key"
                      :command="item.key"
                      :divided="item.divided"
                    >
                      <span class="manufacturing-page__batch-item">
                        <ArtSvgIcon :icon="item.icon" />
                        {{ item.label }}
                      </span>
                    </ElDropdownItem>
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
            </template>
            <template v-else>
              <ElButton
                v-auth="'MesOperationTask:Close'"
                type="primary"
                plain
                :loading="batchBusy"
                @click="handleTaskBatch(selectedRows as MesOperationTask[], 'close', clearSelection)"
                >批量结案</ElButton
              >
              <ElButton
                v-auth="'MesOperationTask:Delete'"
                type="danger"
                plain
                :disabled="batchBusy"
                @click="handleTaskBatch(selectedRows as MesOperationTask[], 'delete', clearSelection)"
                >批量删除</ElButton
              >
            </template>
            <ElButton text :disabled="batchBusy" @click="clearSelection">取消选择</ElButton>
          </div>
        </template>
      </ArtTableQuery>

      <WorkOrderDialog ref="workOrderDialogRef" @success="refreshAfterSave" />
      <WorkOrderAnnotationDialog ref="annotationDialogRef" @success="refreshAfterSave" />
      <WorkOrderSnapshotDialog ref="snapshotDialogRef" />
      <WorkOrderDueDateDialog ref="dueDateDialogRef" @success="handleDueDateSuccess" />
      <ScheduleDialog ref="scheduleDialogRef" @success="refreshAfterSave" />
      <TaskDetailDialog ref="taskDetailDialogRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import { ElMessage, ElTag } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeAccessPolicy } from '@/hooks/core/useTenantScopeAccessPolicy'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { useUserStore } from '@/store/modules/user'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    batchTransitionWorkOrders,
    copyWorkOrders,
    fetchMesReferences,
    fetchOperationTasks,
    fetchWorkOrders,
    importWorkOrders,
    transitionOperationTask,
    transitionWorkOrder,
    type MesOperationTask,
    type MesBatchResult,
    type MesReferenceOption,
    type MesWorkOrder,
    type MesWorkOrderInput
  } from '@mes/api'
  import ScheduleDialog, { type ScheduleDialogOpenData } from './modules/schedule-dialog.vue'
  import WorkOrderAnnotationDialog, {
    type WorkOrderAnnotationDialogOpenData
  } from './modules/work-order-annotation-dialog.vue'
  import WorkOrderDialog, { type WorkOrderDialogOpenData } from './modules/work-order-dialog.vue'
  import WorkOrderDueDateDialog, {
    type WorkOrderDueDateDialogOpenData
  } from './modules/work-order-due-date-dialog.vue'
  import WorkOrderSnapshotDialog, {
    type WorkOrderSnapshotDialogOpenData,
    type WorkOrderSnapshotMode
  } from './modules/work-order-snapshot-dialog.vue'
  import WorkOrderUrgencyLabel from './modules/work-order-urgency-label.vue'
  import TaskDetailDialog, { type TaskDetailDialogOpenData } from './modules/task-detail-dialog.vue'

  defineOptions({ name: 'MesManufacturing' })
  const declaredPermissions = [
    'MesWorkOrder:View',
    'MesWorkOrder:Add',
    'MesWorkOrder:Edit',
    'MesWorkOrder:Delete',
    'MesWorkOrder:Import',
    'MesWorkOrder:Export',
    'MesWorkOrder:Print',
    'MesWorkOrder:Annotate',
    'MesWorkOrder:Confirm',
    'MesWorkOrder:Close',
    'MesWorkOrder:Reopen',
    'MesWorkOrder:Restore',
    'MesWorkOrder:Copy',
    'MesWorkOrder:Get',
    'MesWorkOrder:MaintainDueDate',
    'MesOperationTask:View',
    'MesOperationTask:Export',
    'MesOperationTask:Schedule',
    'MesOperationTask:Close',
    'MesOperationTask:Reopen',
    'MesOperationTask:Delete'
  ] as const
  void declaredPermissions

  const route = useRoute()
  const isWorkOrder = computed(() => route.path.endsWith('/work-order'))
  const routeName = computed(() => (isWorkOrder.value ? 'MesWorkOrder' : 'MesOperationTask'))
  const title = computed(() => (isWorkOrder.value ? '生产工单' : '工序任务'))
  const icon = computed(() => (isWorkOrder.value ? 'ri:file-list-3-line' : 'ri:git-merge-line'))
  const description = computed(() =>
    isWorkOrder.value
      ? '统一创建、确认和跟踪生产工单，保存时集成 BOM 与工艺路线执行基线。'
      : '承接已确认工单的工序明细，完成工作中心排程、关闭与异常回退。'
  )
  const emptyDescription = computed(() =>
    isWorkOrder.value
      ? '点击新增工单，建立第一条生产计划。'
      : '确认带有完整工艺路线的工单后，将自动生成工序任务。'
  )
  const tableRef = ref<ArtTableQueryExpose>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const workOrderDialogRef = ref<{ handleOpen: (data: WorkOrderDialogOpenData) => Promise<void> }>()
  const annotationDialogRef = ref<{
    handleOpen: (data: WorkOrderAnnotationDialogOpenData) => Promise<void>
  }>()
  const snapshotDialogRef = ref<{
    handleOpen: (data: WorkOrderSnapshotDialogOpenData) => Promise<void>
  }>()
  const dueDateDialogRef = ref<{
    handleOpen: (data: WorkOrderDueDateDialogOpenData) => Promise<void>
  }>()
  const scheduleDialogRef = ref<{ handleOpen: (data: ScheduleDialogOpenData) => Promise<void> }>()
  const taskDetailDialogRef = ref<{
    handleOpen: (data: TaskDetailDialogOpenData) => Promise<void>
  }>()
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, tenantOptions } = storeToRefs(tenantScopeStore)
  const { hasAuth } = useAuth()
  const { isCrossTenantReadOnly } = useTenantScopeAccessPolicy()
  const { confirmAction, confirmDelete } = useArtFeedback()
  const batchBusy = ref(false)
  const printRowIds = ref<Set<string>>(new Set())
  const referenceState = reactive({
    employees: [] as MesReferenceOption[],
    workCenters: [] as MesReferenceOption[]
  })
  const overview = reactive({ total: 0, attention: 0, ready: 0 })
  const workspaceTags = computed<BusinessWorkspaceTag[]>(() =>
    isWorkOrder.value
      ? [
          { label: '计划到执行', type: 'primary' },
          { label: '快照留痕', type: 'success' },
          { label: '30 天可恢复', type: 'info' }
        ]
      : [
          { label: '工作中心排程', type: 'primary' },
          { label: '工序级追踪', type: 'success' },
          { label: '状态受控', type: 'info' }
        ]
  )
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前范围',
      value: overview.total,
      description: '符合当前筛选的记录',
      icon: icon.value
    },
    {
      label: isWorkOrder.value ? '待处理' : '待排程',
      value: overview.attention,
      description: isWorkOrder.value ? '待确认与异常工单' : '尚未分配工作中心',
      icon: 'ri:alarm-warning-line',
      tone: overview.attention ? 'warning' : 'success'
    },
    {
      label: isWorkOrder.value ? '已确认' : '已排程',
      value: overview.ready,
      description: '可进入后续生产执行',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    }
  ])
  const statusOptions = computed(() =>
    isWorkOrder.value
      ? [
          ...(getDictMap.value.mesWorkOrderStatus ?? []),
          { label: '回收站（30 天内）', value: '__deleted' }
        ]
      : (getDictMap.value.mesOperationTaskStatus ?? [])
  )
  const statusMeta: Record<
    string,
    { label: string; type: 'info' | 'primary' | 'success' | 'warning' | 'danger' }
  > = {
    pending: { label: '待确认', type: 'info' },
    abnormal: { label: '异常', type: 'danger' },
    confirmed: { label: '已确认', type: 'success' },
    closed: { label: '已结案', type: 'info' },
    unscheduled: { label: '未排程', type: 'warning' },
    scheduled: { label: '已排程', type: 'primary' },
    processing: { label: '加工中', type: 'success' }
  }
  const table = reactive({
    search: {
      keyword: '',
      status: [] as string[],
      plannedDates: undefined as [string, string] | undefined,
      includeDeleted: false,
      workCenterId: ''
    }
  })
  const searchItems = computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = [
      {
        key: 'keyword',
        label: '关键字',
        type: 'input',
        props: {
          clearable: true,
          placeholder: isWorkOrder.value ? '工单号、物料或销售订单' : '工序编码、名称或内容'
        }
      },
      {
        key: 'status',
        label: '业务状态',
        type: 'select',
        props: {
          clearable: true,
          multiple: true,
          collapseTags: true,
          collapseTagsTooltip: true,
          options: statusOptions.value,
          placeholder: '全部状态'
        }
      }
    ]
    if (isWorkOrder.value)
      items.push({
        key: 'plannedDates',
        label: '计划结束',
        type: 'daterange',
        props: {
          valueFormat: 'YYYY-MM-DD',
          startPlaceholder: '开始日期',
          endPlaceholder: '结束日期'
        }
      })
    else
      items.push({
        key: 'workCenterId',
        label: '工作中心',
        type: 'select',
        props: {
          clearable: true,
          filterable: true,
          options: referenceState.workCenters.map((item) => ({
            label: `${item.name} · ${item.code}`,
            value: item.id
          }))
        }
      })
    return items
  })

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() =>
    isWorkOrder.value
      ? [
          {
            type: 'add',
            label: '新增工单',
            permission: 'MesWorkOrder:Add',
            onClick: () => openWorkOrder()
          },
          {
            key: 'get',
            label: '获取工单',
            icon: 'ri:download-cloud-2-line',
            permission: 'MesWorkOrder:Get',
            onClick: handleGetWorkOrders
          },
          {
            type: 'import',
            label: '导入',
            permission: 'MesWorkOrder:Import',
            importColumns: [
              { key: 'materialId', title: '产品物料ID', required: true },
              { key: 'orderQuantity', title: '工单数量', required: true },
              { key: 'plannedEndDate', title: '计划结束日期', required: true },
              { key: 'salesOrderNo', title: '销售订单号' }
            ],
            importTransformer: (rows) =>
              rows.map((row) => ({
                ...row,
                tenantId: effectiveTenantId.value || '',
                workOrderNo: '',
                workOrderTypeId: null,
                projectId: null,
                constructionNo: null,
                plannedStartDate: null,
                source: 'manual',
                urgency: 'normal',
                isInitialDocument: false,
                remark: '',
                specialRequirement: null,
                trackingNo: null,
                followNo: null,
                merchandiserId: null,
                salespersonId: null,
                customerCode: null,
                customProcessCode: null,
                specificationQuantity: null,
                salesOrderQuantity: null
              })),
            importApi: async (rows) => {
              if (!effectiveTenantId.value) throw new Error('请先选择目标租户')
              await importWorkOrders(rows as MesWorkOrderInput[])
            }
          },
          {
            type: 'export',
            label: '导出',
            permission: 'MesWorkOrder:Export',
            exportColumns: [
              { key: 'workOrderNo', title: '工单编号' },
              { key: 'materialCodeSnapshot', title: '物料编码' },
              { key: 'materialNameSnapshot', title: '产品名称' },
              { key: 'orderQuantity', title: '工单数量' },
              { key: 'plannedEndDate', title: '计划结束' },
              { key: 'status', title: '状态' }
            ]
          }
        ]
      : [
          {
            type: 'export',
            label: '导出',
            permission: 'MesOperationTask:Export',
            exportColumns: [
              { key: 'operationCode', title: '工序编码' },
              { key: 'operationName', title: '工序名称' },
              { key: 'plannedQuantity', title: '计划数量' },
              { key: 'reportedGoodQuantity', title: '良品数量' },
              { key: 'status', title: '状态' }
            ]
          },
          {
            key: 'close',
            label: '批量结案',
            icon: 'ri:archive-line',
            permission: 'MesOperationTask:Close',
            selectionRequired: true,
            onClick: async ({ selectedRows, api }) => {
              await Promise.all(
                (selectedRows as MesOperationTask[]).map((row) =>
                  transitionOperationTask(row.id, 'close')
                )
              )
              await api.refreshData()
            }
          }
        ]
  )
  interface BatchCommandOption {
    key: 'reference' | 'print' | 'confirm' | 'close' | 'delete' | 'due-date'
    label: string
    icon: string
    permission: string
    divided?: boolean
  }
  const batchCommands: BatchCommandOption[] = [
    {
      key: 'reference',
      label: '批量参考',
      icon: 'ri:file-copy-2-line',
      permission: 'MesWorkOrder:Copy'
    },
    {
      key: 'print',
      label: '批量打印',
      icon: 'ri:printer-line',
      permission: 'MesWorkOrder:Print'
    },
    {
      key: 'confirm',
      label: '批量确认',
      icon: 'ri:checkbox-circle-line',
      permission: 'MesWorkOrder:Confirm'
    },
    {
      key: 'close',
      label: '批量结案',
      icon: 'ri:archive-line',
      permission: 'MesWorkOrder:Close'
    },
    {
      key: 'delete',
      label: '批量删除',
      icon: 'ri:delete-bin-6-line',
      permission: 'MesWorkOrder:Delete',
      divided: true
    },
    {
      key: 'due-date',
      label: '交期维护',
      icon: 'ri:calendar-check-line',
      permission: 'MesWorkOrder:MaintainDueDate'
    }
  ]
  const visibleBatchCommands = computed(() =>
    isCrossTenantReadOnly.value
      ? []
      : batchCommands.filter((command) => hasAuth(command.permission))
  )
  const statusTag = (status: string) => {
    const meta = statusMeta[status] || { label: status, type: 'info' as const }
    const dictCode = isWorkOrder.value ? 'mesWorkOrderStatus' : 'mesOperationTaskStatus'
    const label =
      getDictMap.value[dictCode]?.find((item) => item.value === status)?.label || meta.label
    return (
      <ElTag type={meta.type} effect="light">
        {label}
      </ElTag>
    )
  }
  const workOrderColumns = (): ColumnOption<MesWorkOrder>[] => [
    { type: 'selection', width: 48 },
    { type: 'globalIndex', label: '序号', width: 70 },
    {
      prop: 'workOrderNo',
      label: '工单编号',
      minWidth: 156,
      fixed: 'left',
      showOverflowTooltip: true
    },
    {
      prop: 'workOrderTypeNameSnapshot',
      label: '工单类型',
      minWidth: 138,
      formatter: (row) => (
        <span class="manufacturing-page__order-type">
          <span>{row.workOrderTypeNameSnapshot || '未分类'}</span>
          <WorkOrderUrgencyLabel urgency={row.urgency} showText={false} />
        </span>
      )
    },
    { prop: 'materialCodeSnapshot', label: '物料编码', minWidth: 140, showOverflowTooltip: true },
    { prop: 'materialNameSnapshot', label: '物料描述', minWidth: 180, showOverflowTooltip: true },
    { prop: 'specificationSnapshot', label: '规格型号', minWidth: 140, showOverflowTooltip: true },
    {
      prop: 'orderQuantity',
      label: '工单数量',
      width: 112,
      align: 'right',
      formatter: (row) => `${row.orderQuantity} ${row.unitSnapshot || ''}`
    },
    { prop: 'plannedEndDate', label: '计划结束', width: 116 },
    { prop: 'printCount', label: '打印次数', width: 96, align: 'right' },
    {
      prop: 'urgency',
      label: '紧急程度',
      width: 96,
      align: 'center',
      formatter: (row) => <WorkOrderUrgencyLabel urgency={row.urgency} />
    },
    {
      prop: 'snapshots',
      label: '生产资料',
      width: 196,
      align: 'center',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            permission="MesWorkOrder:View"
            icon="ri:organization-chart"
            label="BOM"
            showLabel
            onClick={() => openSnapshot(row, 'bom')}
          />
          <ArtButtonTable
            permission="MesWorkOrder:View"
            icon="ri:git-branch-line"
            label="工艺路线"
            showLabel
            onClick={() => openSnapshot(row, 'route')}
          />
        </BusinessTableRowActions>
      )
    },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      align: 'center',
      formatter: (row) => statusTag(row.status)
    },
    {
      prop: 'statusReason',
      label: '状态说明',
      minWidth: 190,
      showOverflowTooltip: true,
      formatter: (row) => row.statusReason || '—'
    },
    {
      prop: 'updateTime',
      label: '更新时间',
      width: 164,
      formatter: (row) => dayjs(row.updateTime).format('YYYY-MM-DD HH:mm')
    },
    {
      prop: 'operation',
      label: '操作',
      width: 216,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="MesWorkOrder:View"
            onClick={() => openWorkOrder(row, true)}
          />
          {!row.deletedAt && ['pending', 'abnormal'].includes(row.status) && (
            <ArtButtonTable
              type="edit"
              permission="MesWorkOrder:Edit"
              onClick={() => openWorkOrder(row)}
            />
          )}
          <ArtButtonMore
            list={workOrderMore(row)}
            onClick={(item) => handleWorkOrderAction(row, String(item.key))}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  const taskColumns = (): ColumnOption<MesOperationTask>[] => [
    { type: 'selection', width: 48 },
    { type: 'globalIndex', label: '序号', width: 70 },
    {
      prop: 'workOrderNo',
      label: '工单编号',
      minWidth: 150,
      fixed: 'left',
      formatter: (row) => row.workOrder?.workOrderNo || '—'
    },
    { prop: 'operationCode', label: '工序编码', minWidth: 130, showOverflowTooltip: true },
    { prop: 'operationName', label: '工序名称', minWidth: 160, showOverflowTooltip: true },
    {
      prop: 'materialName',
      label: '产品',
      minWidth: 180,
      showOverflowTooltip: true,
      formatter: (row) =>
        row.workOrder
          ? `${row.workOrder.materialCodeSnapshot} · ${row.workOrder.materialNameSnapshot}`
          : '—'
    },
    { prop: 'plannedQuantity', label: '计划数量', width: 110, align: 'right' },
    { prop: 'reportedGoodQuantity', label: '良品数量', width: 110, align: 'right' },
    { prop: 'reportedBadQuantity', label: '不良数量', width: 110, align: 'right' },
    {
      prop: 'workCenterId',
      label: '工作中心',
      minWidth: 150,
      formatter: (row) =>
        referenceState.workCenters.find((item) => item.id === row.workCenterId)?.name || '未排程'
    },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      align: 'center',
      formatter: (row) => statusTag(row.status)
    },
    {
      prop: 'plannedEndDate',
      label: '计划结束',
      width: 116,
      formatter: (row) => row.plannedEndDate || '—'
    },
    {
      prop: 'operation',
      label: '操作',
      width: 216,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="MesOperationTask:View"
            onClick={() => openTaskDetail(row)}
          />
          {!row.deletedAt && ['unscheduled', 'scheduled'].includes(row.status) && (
            <ArtButtonTable
              type="edit"
              label="排程"
              permission="MesOperationTask:Schedule"
              onClick={() => openSchedule(row)}
            />
          )}
          <ArtButtonMore
            list={taskMore(row)}
            onClick={(item) => handleTaskAction(row, String(item.key))}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  const columnsFactory = () => (isWorkOrder.value ? workOrderColumns() : taskColumns())

  function workOrderMore(row: MesWorkOrder) {
    if (row.deletedAt)
      return [
        {
          key: 'restore',
          label: '恢复',
          icon: 'ri:arrow-go-back-line',
          auth: 'MesWorkOrder:Restore'
        }
      ]
    return [
      {
        key: 'copy',
        label: '复制',
        icon: 'ri:file-copy-2-line',
        auth: 'MesWorkOrder:Copy'
      },
      { key: 'print', label: '打印', icon: 'ri:printer-line', auth: 'MesWorkOrder:Print' },
      {
        key: 'annotate',
        label: '工单批注',
        icon: 'ri:sticky-note-add-line',
        auth: 'MesWorkOrder:Annotate'
      },
      ...(['pending', 'abnormal'].includes(row.status)
        ? [
            {
              key: 'confirm',
              label: '确认工单',
              icon: 'ri:checkbox-circle-line',
              auth: 'MesWorkOrder:Confirm'
            }
          ]
        : []),
      ...(row.status === 'confirmed'
        ? [{ key: 'close', label: '结案', icon: 'ri:archive-line', auth: 'MesWorkOrder:Close' }]
        : []),
      ...(row.status === 'closed'
        ? [
            {
              key: 'reopen',
              label: '撤销结案',
              icon: 'ri:arrow-go-back-line',
              auth: 'MesWorkOrder:Reopen'
            }
          ]
        : []),
      {
        key: 'delete',
        label: '删除',
        icon: 'ri:delete-bin-6-line',
        color: 'var(--el-color-danger)',
        auth: 'MesWorkOrder:Delete'
      }
    ]
  }
  function taskMore(row: MesOperationTask) {
    if (row.deletedAt) return []
    return [
      ...(['unscheduled', 'scheduled'].includes(row.status)
        ? [
            {
              key: 'close',
              label: '关闭',
              icon: 'ri:close-circle-line',
              auth: 'MesOperationTask:Close'
            }
          ]
        : []),
      ...(row.status === 'closed'
        ? [
            {
              key: 'reopen',
              label: '重新打开',
              icon: 'ri:arrow-go-back-line',
              auth: 'MesOperationTask:Reopen'
            }
          ]
        : []),
      {
        key: 'delete',
        label: '删除',
        icon: 'ri:delete-bin-6-line',
        color: 'var(--el-color-danger)',
        auth: 'MesOperationTask:Delete'
      }
    ]
  }
  async function fetchRows(
    params: typeof table.search & { current: number; size: number },
    options?: { signal?: AbortSignal }
  ) {
    const result = isWorkOrder.value
      ? await fetchWorkOrders({ ...params, tenantId: effectiveTenantId.value }, options)
      : await fetchOperationTasks({ ...params, tenantId: effectiveTenantId.value }, options)
    overview.total = result.total
    overview.attention = result.data.filter((row) =>
      isWorkOrder.value
        ? ['pending', 'abnormal'].includes((row as MesWorkOrder).status)
        : (row as MesOperationTask).status === 'unscheduled'
    ).length
    overview.ready = result.data.filter((row) =>
      isWorkOrder.value
        ? (row as MesWorkOrder).status === 'confirmed'
        : (row as MesOperationTask).status === 'scheduled'
    ).length
    return { records: result.data, total: result.total }
  }
  function tenantChoices() {
    return tenantOptions.value.map((tenant) => ({
      label: `${tenant.tenantName || tenant.tenantCode}（${tenant.tenantCode}）`,
      value: tenant.id
    }))
  }
  function openWorkOrder(row?: MesWorkOrder, readonly = false) {
    void workOrderDialogRef.value?.handleOpen({
      tenantId: row?.tenantId || effectiveTenantId.value || '',
      tenantOptions: tenantChoices(),
      row,
      readonly
    })
  }
  function openSchedule(row: MesOperationTask) {
    void scheduleDialogRef.value?.handleOpen({ row, workCenters: referenceState.workCenters })
  }
  function openTaskDetail(row: MesOperationTask) {
    void taskDetailDialogRef.value?.handleOpen({
      row,
      workCenters: referenceState.workCenters
    })
  }
  function openSnapshot(row: MesWorkOrder, mode: WorkOrderSnapshotMode): void {
    void snapshotDialogRef.value?.handleOpen({ row, mode })
  }
  function tableRowClassName({ row }: { row: Record<string, unknown> }): string {
    if (!printRowIds.value.size || !isWorkOrder.value) return ''
    const rowId = typeof row.id === 'string' ? row.id : ''
    return printRowIds.value.has(rowId) ? 'is-print-selected' : 'is-print-excluded'
  }
  async function handleGetWorkOrders(): Promise<void> {
    await tableRef.value?.getData()
    ElMessage.success('已获取当前范围的最新生产工单')
  }
  function notifyBatchResult(result: MesBatchResult, actionLabel: string): void {
    const successCount = result.successIds.length
    const failureCount = result.failures.length
    if (!failureCount) {
      ElMessage.success(`${actionLabel}完成，共处理 ${successCount} 张工单`)
      return
    }
    const firstFailure = result.failures[0]?.message || '部分工单不满足当前操作条件'
    const message = `${actionLabel}完成：成功 ${successCount} 张，失败 ${failureCount} 张。${firstFailure}`
    if (successCount) ElMessage.warning(message)
    else ElMessage.error(message)
  }
  async function confirmBatchAction(message: string, title: string): Promise<boolean> {
    try {
      await confirmAction(message, title, { confirmButtonText: '继续处理' })
      return true
    } catch {
      return false
    }
  }
  async function printWorkOrders(rows: MesWorkOrder[]): Promise<void> {
    const result = await batchTransitionWorkOrders(
      rows.map((row) => row.id),
      'print'
    )
    notifyBatchResult(result, '批量打印')
    if (!result.successIds.length) return
    printRowIds.value = new Set(result.successIds)
    await nextTick()
    const clearPrintSelection = () => {
      printRowIds.value = new Set()
    }
    window.addEventListener('afterprint', clearPrintSelection, { once: true })
    window.print()
    clearPrintSelection()
  }
  async function handleCopySelected(
    rows: MesWorkOrder[],
    clearSelection: () => void
  ): Promise<void> {
    if (rows.length !== 1) return
    batchBusy.value = true
    try {
      const result = await copyWorkOrders([rows[0]!.id])
      notifyBatchResult(result, '复制')
      if (result.successIds.length) {
        clearSelection()
        await tableRef.value?.refreshCreate()
      }
    } finally {
      batchBusy.value = false
    }
  }
  let dueDateClearSelection: (() => void) | undefined
  async function handleBatchCommand(
    command: string,
    rows: MesWorkOrder[],
    clearSelection: () => void
  ): Promise<void> {
    if (!rows.length) return
    if (command === 'due-date') {
      dueDateClearSelection = clearSelection
      const sharedDate = rows.every((row) => row.plannedEndDate === rows[0]?.plannedEndDate)
        ? rows[0]?.plannedEndDate
        : undefined
      await dueDateDialogRef.value?.handleOpen({
        ids: rows.map((row) => row.id),
        initialDate: sharedDate
      })
      return
    }
    const confirmationMap: Record<string, { message: string; title: string }> = {
      reference: {
        message: `将参照 ${rows.length} 张工单创建新的待确认工单，是否继续？`,
        title: '批量参考'
      },
      confirm: {
        message: `将确认 ${rows.length} 张工单，并为成功确认的工单生成工序任务，是否继续？`,
        title: '批量确认'
      },
      close: {
        message: `将结案 ${rows.length} 张工单及其未结案工序任务，是否继续？`,
        title: '批量结案'
      },
      delete: {
        message: `确定删除选中的 ${rows.length} 张工单吗？30 天内可恢复。`,
        title: '批量删除'
      }
    }
    const confirmation = confirmationMap[command]
    if (confirmation && !(await confirmBatchAction(confirmation.message, confirmation.title)))
      return

    batchBusy.value = true
    try {
      if (command === 'print') {
        await printWorkOrders(rows)
      } else {
        const result =
          command === 'reference'
            ? await copyWorkOrders(rows.map((row) => row.id))
            : await batchTransitionWorkOrders(
                rows.map((row) => row.id),
                command
              )
        notifyBatchResult(result, confirmation?.title || '批量操作')
      }
      clearSelection()
      if (command === 'reference') await tableRef.value?.refreshCreate()
      else if (command === 'delete') await tableRef.value?.refreshRemove()
      else await tableRef.value?.refreshData()
    } finally {
      batchBusy.value = false
    }
  }
  async function handleDueDateSuccess(result: MesBatchResult): Promise<void> {
    notifyBatchResult(result, '交期维护')
    if (result.successIds.length) {
      dueDateClearSelection?.()
      await tableRef.value?.refreshUpdate()
    }
    dueDateClearSelection = undefined
  }
  async function handleTaskBatch(
    rows: MesOperationTask[],
    action: 'close' | 'delete',
    clearSelection: () => void
  ): Promise<void> {
    const title = action === 'close' ? '批量结案' : '批量删除'
    if (
      !(await confirmBatchAction(`确定对选中的 ${rows.length} 条工序任务执行${title}吗？`, title))
    )
      return
    batchBusy.value = true
    try {
      for (const row of rows) await transitionOperationTask(row.id, action)
      clearSelection()
      if (action === 'delete') await tableRef.value?.refreshRemove()
      else await tableRef.value?.refreshData()
    } finally {
      batchBusy.value = false
    }
  }
  async function handleWorkOrderAction(row: MesWorkOrder, action: string) {
    if (action === 'annotate') {
      await annotationDialogRef.value?.handleOpen({ row })
      return
    }
    if (action === 'copy') {
      const result = await copyWorkOrders([row.id])
      notifyBatchResult(result, '复制')
      if (result.successIds.length) await tableRef.value?.refreshCreate()
      return
    }
    if (action === 'print') {
      await printWorkOrders([row])
      await tableRef.value?.refreshData()
      return
    }
    if (action === 'delete')
      await confirmDelete(`确定删除工单“${row.workOrderNo}”吗？30 天内可恢复。`)
    await transitionWorkOrder(row.id, action)
    await tableRef.value?.refreshData()
  }
  async function handleTaskAction(row: MesOperationTask, action: string) {
    if (action === 'delete') await confirmDelete(`确定删除工序任务“${row.operationName}”吗？`)
    await transitionOperationTask(row.id, action)
    await tableRef.value?.refreshData()
  }
  async function refreshAfterSave() {
    await tableRef.value?.refreshData()
  }
  let contextRequestId = 0
  async function loadContext() {
    const request = ++contextRequestId
    Object.assign(overview, { total: 0, attention: 0, ready: 0 })
    Object.assign(table.search, {
      keyword: '',
      status: [],
      plannedDates: undefined,
      includeDeleted: false,
      workCenterId: ''
    })
    await nextTick()
    await tenantScopeStore.loadTenantOptions()
    await Promise.all(
      [
        'mesWorkOrderSource',
        'mesWorkOrderUrgency',
        'mesWorkOrderStatus',
        'mesOperationTaskStatus',
        'mdmProcessRouteSequenceType'
      ].map((code) => userStore.ensureDictLoaded(code))
    )
    if (request !== contextRequestId) return
    const refs = await fetchMesReferences(effectiveTenantId.value || undefined)
    if (request !== contextRequestId) return
    referenceState.employees = refs.employees
    referenceState.workCenters = refs.workCenters
    await nextTick()
    if (request !== contextRequestId) return
    await tableRef.value?.getData()
  }
  watch([() => route.path, effectiveTenantId], () => void loadContext(), { immediate: true })
</script>

<style scoped lang="scss">
  .manufacturing-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    min-height: 0;

    &__selection-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }

    &__selection-summary,
    &__batch-item,
    &__order-type {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
    }

    &__selection-summary {
      color: var(--art-gray-700);

      strong {
        color: var(--theme-color);
      }
    }

    &__selection-divider {
      width: 1px;
      height: 20px;
      background: var(--el-border-color);
    }

    &__order-type {
      max-width: 100%;

      > span:first-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  @media print {
    .manufacturing-page :deep(.art-search-bar),
    .manufacturing-page :deep(.el-pagination),
    .manufacturing-page :deep(.el-table__fixed-right) {
      display: none !important;
    }

    .manufacturing-page :deep(.el-table__body tr.is-print-excluded) {
      display: none !important;
    }
  }
</style>
