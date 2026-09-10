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
        ref="tableRef"
        v-model="table.search"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        :selection-actions="selectionActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 82, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${title}`,
          emptyDescription: emptyDescription
        }"
        focusable
      />

      <WorkOrderDialog ref="workOrderDialogRef" @success="refreshAfterSave" />
      <WorkOrderAnnotationDialog ref="annotationDialogRef" @success="refreshAfterSave" />
      <ScheduleDialog ref="scheduleDialogRef" @success="refreshAfterSave" />
      <TaskDetailDialog ref="taskDetailDialogRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import { ElTag } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { useUserStore } from '@/store/modules/user'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    fetchMesReferences,
    fetchOperationTasks,
    fetchWorkOrders,
    importWorkOrders,
    transitionOperationTask,
    transitionWorkOrder,
    type MesOperationTask,
    type MesReferenceOption,
    type MesWorkOrder,
    type MesWorkOrderInput
  } from '@mes/api'
  import ScheduleDialog, { type ScheduleDialogOpenData } from './modules/schedule-dialog.vue'
  import WorkOrderAnnotationDialog, {
    type WorkOrderAnnotationDialogOpenData
  } from './modules/work-order-annotation-dialog.vue'
  import WorkOrderDialog, { type WorkOrderDialogOpenData } from './modules/work-order-dialog.vue'
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
  const title = computed(() => (isWorkOrder.value ? '工单管理' : '工序任务'))
  const icon = computed(() => (isWorkOrder.value ? 'ri:file-list-3-line' : 'ri:git-merge-line'))
  const description = computed(() =>
    isWorkOrder.value
      ? '统一创建、确认和跟踪生产工单，确认时固化 BOM 与工艺路线执行基线。'
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
  const scheduleDialogRef = ref<{ handleOpen: (data: ScheduleDialogOpenData) => Promise<void> }>()
  const taskDetailDialogRef = ref<{
    handleOpen: (data: TaskDetailDialogOpenData) => Promise<void>
  }>()
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, tenantOptions } = storeToRefs(tenantScopeStore)
  const { confirmDelete } = useArtFeedback()
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
    closed: { label: '已关闭', type: 'info' },
    unscheduled: { label: '未排程', type: 'warning' },
    scheduled: { label: '已排程', type: 'primary' },
    processing: { label: '加工中', type: 'success' }
  }
  const table = reactive({
    search: {
      keyword: '',
      status: '',
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
        props: { clearable: true, options: statusOptions.value, placeholder: '全部状态' }
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
          },
          {
            key: 'print',
            label: '批量打印',
            icon: 'ri:printer-line',
            permission: 'MesWorkOrder:Print',
            selectionRequired: true,
            onClick: async ({ selectedRows }) => {
              await runBatch(selectedRows as MesWorkOrder[], 'print')
              window.print()
            }
          },
          {
            key: 'confirm',
            label: '批量确认',
            icon: 'ri:checkbox-circle-line',
            permission: 'MesWorkOrder:Confirm',
            selectionRequired: true,
            onClick: ({ selectedRows }) => runBatch(selectedRows as MesWorkOrder[], 'confirm')
          },
          {
            key: 'close',
            label: '批量结案',
            icon: 'ri:archive-line',
            permission: 'MesWorkOrder:Close',
            selectionRequired: true,
            onClick: ({ selectedRows }) => runBatch(selectedRows as MesWorkOrder[], 'close')
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
  const selectionActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'delete',
      permission: `${routeName.value}:Delete`,
      content: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
        `确定删除选中的 ${selectedCount} 条${title.value}吗？`,
      onClick: async ({ selectedRows, api }) => {
        if (isWorkOrder.value) await runBatch(selectedRows as MesWorkOrder[], 'delete', false)
        else
          await Promise.all(
            (selectedRows as MesOperationTask[]).map((row) =>
              transitionOperationTask(row.id, 'delete')
            )
          )
        await api.refreshRemove()
      }
    }
  ])

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
    { prop: 'materialCodeSnapshot', label: '物料编码', minWidth: 140, showOverflowTooltip: true },
    { prop: 'materialNameSnapshot', label: '产品名称', minWidth: 180, showOverflowTooltip: true },
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
      formatter: (row) =>
        row.urgency === 'urgent3' ? (
          <ElTag type="danger">{dictLabel('mesWorkOrderUrgency', row.urgency)}</ElTag>
        ) : row.urgency === 'urgent2' ? (
          <ElTag type="warning">{dictLabel('mesWorkOrderUrgency', row.urgency)}</ElTag>
        ) : row.urgency === 'urgent1' ? (
          <ElTag type="warning" effect="plain">
            {dictLabel('mesWorkOrderUrgency', row.urgency)}
          </ElTag>
        ) : (
          dictLabel('mesWorkOrderUrgency', row.urgency)
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
  function dictLabel(code: string, value: string): string {
    return getDictMap.value[code]?.find((item) => item.value === value)?.label || value
  }
  async function runBatch(rows: MesWorkOrder[], action: string, refresh = true) {
    for (const row of rows) await transitionWorkOrder(row.id, action)
    if (refresh) await tableRef.value?.refreshData()
  }
  async function handleWorkOrderAction(row: MesWorkOrder, action: string) {
    if (action === 'annotate') {
      await annotationDialogRef.value?.handleOpen({ row })
      return
    }
    if (action === 'print') {
      await transitionWorkOrder(row.id, 'print')
      window.print()
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
  async function loadContext() {
    Object.assign(table.search, {
      keyword: '',
      status: '',
      plannedDates: undefined,
      includeDeleted: false,
      workCenterId: ''
    })
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
    const refs = await fetchMesReferences(effectiveTenantId.value || undefined)
    referenceState.employees = refs.employees
    referenceState.workCenters = refs.workCenters
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
  }

  @media print {
    .manufacturing-page :deep(.art-search-bar),
    .manufacturing-page :deep(.el-pagination),
    .manufacturing-page :deep(.el-table__fixed-right) {
      display: none !important;
    }
  }
</style>
