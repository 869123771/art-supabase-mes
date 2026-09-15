<template>
  <ArtPermissionGuard permission="MesScheduling:View" resource-name="排产">
    <div
      class="scheduling-page business-workspace-page art-full-height"
      :class="{ 'is-focus-mode': focusMode }"
    >
      <BusinessWorkspaceHeader
        v-show="!focusMode"
        eyebrow="LEAN SCHEDULING"
        title="排产"
        description="围绕已确认生产工单安排工序、工作中心与计划周期，形成可执行的生产顺序。"
        icon="ri:calendar-schedule-line"
        :tags="workspaceTags"
        :metrics="metrics"
        density="compact"
        refreshable
        :refresh-loading="state.loading"
        @refresh="loadWorkspace"
      >
        <template #actions>
          <BusinessWorkspaceFocusToggle v-model="focusMode" />
        </template>
      </BusinessWorkspaceHeader>

      <div class="scheduling-page__workspace business-workspace-content">
        <ArtSectionCard
          class="scheduling-page__queue-card"
          title="待排工单"
          subtitle="已确认工单可排产；待确认与异常工单会标明阻塞原因。"
          :loading="state.loading"
          :error="state.error"
          :empty="!state.loading && !state.error && !queueOrders.length"
          empty-title="暂无待处理生产工单"
          empty-description="新建生产工单并完成确认后，可在这里继续安排工序资源。"
          :min-height="0"
          body-class="scheduling-page__card-body"
          retryable
          @retry="loadWorkspace"
        >
          <template #actions>
            <ElTag type="info" effect="plain" round> {{ queueOrders.length }} 张工单 </ElTag>
          </template>

          <template #empty-action>
            <ElButton type="primary" plain @click="goToWorkOrders">前往生产工单</ElButton>
          </template>

          <div v-if="queueOrders.length" class="scheduling-page__queue-tools">
            <ElInput
              v-model="filters.keyword"
              clearable
              placeholder="搜索工单号或产品"
              aria-label="搜索待排工单"
            >
              <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
            </ElInput>
            <span>按交期与紧急程度核对待排顺序</span>
          </div>

          <ElScrollbar v-if="visibleOrders.length" class="scheduling-page__order-scrollbar">
            <div class="scheduling-page__order-list">
              <button
                v-for="order in visibleOrders"
                :key="order.id"
                type="button"
                class="scheduling-page__order"
                :class="{ 'is-active': order.id === selectedOrderId }"
                :aria-pressed="order.id === selectedOrderId"
                @click="selectedOrderId = order.id"
              >
                <span class="scheduling-page__order-head">
                  <strong>{{ order.workOrderNo }}</strong>
                  <ArtDictDisplay
                    dict-code="mesWorkOrderStatus"
                    :value="order.status"
                    display="tag"
                  />
                </span>
                <span class="scheduling-page__product">
                  {{ order.materialCodeSnapshot }} · {{ order.materialNameSnapshot }}
                </span>
                <span
                  v-if="order.statusReason"
                  class="scheduling-page__order-blocker"
                  :title="order.statusReason"
                >
                  <ArtSvgIcon icon="ri:alert-line" />
                  {{ order.statusReason }}
                </span>
                <span class="scheduling-page__order-foot">
                  <span class="scheduling-page__order-meta">
                    <ArtDictDisplay
                      dict-code="mesWorkOrderUrgency"
                      :value="order.urgency"
                      display="text"
                    />
                    · {{ tasksForOrder(order.id).length }} 道工序
                  </span>
                  <span>交期 {{ order.plannedEndDate }}</span>
                </span>
                <i
                  v-if="scheduleProgress(order.id)"
                  :style="{ width: `${scheduleProgress(order.id)}%` }"
                />
              </button>
            </div>
          </ElScrollbar>
          <ArtEmptyState
            v-else-if="queueOrders.length"
            class="scheduling-page__queue-empty"
            title="没有匹配的待排工单"
            description="请调整工单号或产品关键字后重新搜索。"
            :visual-size="72"
          >
            <ElButton plain @click="filters.keyword = ''">清除搜索</ElButton>
          </ArtEmptyState>
        </ArtSectionCard>

        <ArtSectionCard
          class="scheduling-page__detail-card"
          :title="selectedOrder?.workOrderNo || '工序排产明细'"
          :subtitle="
            selectedOrder
              ? `${selectedOrder.materialCodeSnapshot} · ${selectedOrder.materialNameSnapshot}`
              : '选择左侧工单开始排产'
          "
          :loading="state.loading"
          :error="state.error"
          :empty="!state.loading && (!selectedOrder || !selectedOrderSchedulable)"
          :empty-title="detailEmptyTitle"
          :empty-description="detailEmptyDescription"
          :min-height="0"
          body-class="scheduling-page__card-body"
          retryable
          @retry="loadWorkspace"
        >
          <template #actions>
            <BusinessWorkspaceFocusToggle v-if="focusMode" v-model="focusMode" />
            <ArtDictDisplay
              v-if="selectedOrder"
              dict-code="mesWorkOrderStatus"
              :value="selectedOrder.status"
              display="tag"
            />
            <ElSegmented
              v-if="selectedOrderSchedulable"
              v-model="filters.taskScope"
              :options="taskScopeOptions"
              size="small"
              aria-label="工序任务范围"
            />
          </template>

          <template #empty-action>
            <ElButton v-if="selectedOrder" type="primary" plain @click="goToWorkOrders">
              处理生产工单
            </ElButton>
          </template>

          <template v-if="selectedOrderSchedulable && selectedOrder">
            <div class="scheduling-page__health" aria-label="当前工单排产健康度">
              <div>
                <span><i class="is-primary" />排程进度</span>
                <strong>{{ scheduleProgress(selectedOrder.id) }}%</strong>
              </div>
              <div>
                <span><i class="is-warning" />待排工序</span>
                <strong>{{ selectedStats.unscheduled }}</strong>
              </div>
              <div>
                <span><i class="is-danger" />资源冲突</span>
                <strong>{{ selectedStats.conflicts }}</strong>
              </div>
              <div>
                <span><i class="is-info" />计划周期</span>
                <strong
                  >{{ selectedOrder.plannedStartDate || '待定' }} —
                  {{ selectedOrder.plannedEndDate }}</strong
                >
              </div>
            </div>

            <ArtTable
              class="scheduling-page__task-table"
              row-key="id"
              :data="visibleTasks"
              :columns="taskColumns"
              :pagination="false"
              :show-table-header="false"
              height="100%"
              empty-height="100%"
              :empty-text="filters.taskScope === 'attention' ? '暂无待处理工序' : '暂无工序任务'"
              empty-description="切换为全部工序，或检查工单确认时是否已生成工序任务。"
            >
              <template #sequenceNo="{ row }">
                <strong class="scheduling-page__sequence">{{ row.sequenceNo }}</strong>
              </template>
              <template #operationName="{ row }">
                <span class="scheduling-page__operation-name">
                  <strong>{{ row.operationName }}</strong>
                  <small>{{ row.operationCode }}</small>
                </span>
              </template>
              <template #plannedStartDate="{ row }">
                <span class="scheduling-page__planned-period">
                  {{ taskStartDate(row) || '待定' }} — {{ taskEndDate(row) || '待定' }}
                </span>
              </template>
              <template #status="{ row }">
                <ElTag :type="riskMeta(row).type" effect="light" size="small">
                  {{ riskMeta(row).label }}
                </ElTag>
              </template>
              <template #operation="{ row }">
                <ArtButtonTable
                  type="edit"
                  :label="row.schedulingStatus === 'scheduled' ? '调整排程' : '安排排程'"
                  permission="MesOperationTask:Schedule"
                  :disabled="!['pending', 'scheduled'].includes(row.schedulingStatus)"
                  @click="openSchedule(row)"
                />
              </template>
            </ArtTable>
          </template>
        </ArtSectionCard>
      </div>

      <ScheduleDialog ref="scheduleDialogRef" @success="loadWorkspace" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { storeToRefs } from 'pinia'
  import type { TagProps } from 'element-plus'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import BusinessWorkspaceFocusToggle from '@/components/business/business-workspace-focus-toggle/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import { useWorkspaceFocus } from '@/hooks/core/useWorkspaceFocus'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import type { ColumnOption } from '@/types'
  import {
    fetchMesReferences,
    fetchOperationTasks,
    fetchWorkOrders,
    type MesOperationTask,
    type MesReferenceOption,
    type MesWorkOrder
  } from '@mes/api'
  import ScheduleDialog, {
    type ScheduleDialogOpenData
  } from '../manufacturing/modules/schedule-dialog.vue'
  import {
    conflictTaskIds,
    scheduleRisk,
    scheduleRiskLabel,
    taskEndDate,
    taskStartDate
  } from './modules/schedule-policy'

  defineOptions({ name: 'MesScheduling' })
  const declaredPermissions = ['MesScheduling:View', 'MesOperationTask:Schedule'] as const
  void declaredPermissions

  const tenantScopeStore = useTenantScopeStore()
  const router = useRouter()
  const { focusMode } = useWorkspaceFocus()
  const { effectiveTenantId } = storeToRefs(tenantScopeStore)
  const scheduleDialogRef = ref<{ handleOpen: (data: ScheduleDialogOpenData) => Promise<void> }>()
  const state = reactive({
    loading: false,
    error: '',
    orders: [] as MesWorkOrder[],
    tasks: [] as MesOperationTask[],
    workCenters: [] as MesReferenceOption[]
  })
  const filters = reactive({ keyword: '', taskScope: 'all' as 'all' | 'attention' })
  const selectedOrderId = ref('')
  const taskScopeOptions = [
    { label: '全部工序', value: 'all' },
    { label: '仅看待处理', value: 'attention' }
  ]
  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '工单驱动', type: 'primary' },
    { label: '资源约束', type: 'warning' },
    { label: '工序落地', type: 'success' }
  ]

  const schedulableOrders = computed(() =>
    state.orders.filter((order) => order.status === 'confirmed')
  )
  const queueOrders = computed(() => state.orders.filter((order) => order.status !== 'closed'))
  const visibleOrders = computed(() => {
    const keyword = filters.keyword.trim().toLocaleLowerCase()
    if (!keyword) return queueOrders.value
    return queueOrders.value.filter((order) =>
      [order.workOrderNo, order.materialCodeSnapshot, order.materialNameSnapshot].some((value) =>
        value.toLocaleLowerCase().includes(keyword)
      )
    )
  })
  const selectedOrder = computed(() =>
    queueOrders.value.find((order) => order.id === selectedOrderId.value)
  )
  const selectedOrderSchedulable = computed(() => selectedOrder.value?.status === 'confirmed')
  const detailEmptyTitle = computed(() => {
    if (!selectedOrder.value) return '请选择生产工单'
    if (selectedOrder.value.status === 'abnormal') return '当前工单存在异常，暂不可排产'
    return '当前工单尚未确认，暂不可排产'
  })
  const detailEmptyDescription = computed(() => {
    if (!selectedOrder.value) return '选中左侧工单后，可查看排产条件与工序明细。'
    if (selectedOrder.value.status === 'abnormal') {
      return selectedOrder.value.statusReason || '请先处理工单异常，再重新确认并进入排产。'
    }
    return '请先在生产工单中完成确认；确认成功后系统会生成对应工序任务。'
  })
  const selectedTasks = computed(() => tasksForOrder(selectedOrderId.value))
  const conflicts = computed(() => conflictTaskIds(state.tasks))
  const visibleTasks = computed(() =>
    filters.taskScope === 'attention'
      ? selectedTasks.value.filter((task) => scheduleRisk(task, conflicts.value) !== 'healthy')
      : selectedTasks.value
  )
  const selectedStats = computed(() => ({
    unscheduled: selectedTasks.value.filter(
      (task) => scheduleRisk(task, conflicts.value) === 'unassigned'
    ).length,
    conflicts: selectedTasks.value.filter((task) => conflicts.value.has(task.id)).length
  }))
  const taskColumns: ColumnOption<MesOperationTask>[] = [
    {
      prop: 'sequenceNo',
      label: '顺序',
      width: 86,
      fixed: 'left',
      useSlot: true
    },
    {
      prop: 'operationName',
      label: '工序',
      minWidth: 190,
      useSlot: true
    },
    {
      prop: 'workCenterId',
      label: '工作中心',
      minWidth: 200,
      showOverflowTooltip: true,
      formatter: (row) => workCenterName(row.workCenterId)
    },
    {
      prop: 'plannedStartDate',
      label: '计划周期',
      minWidth: 230,
      useSlot: true
    },
    {
      prop: 'status',
      label: '排程状态',
      width: 126,
      align: 'center',
      useSlot: true
    },
    {
      prop: 'operation',
      label: '操作',
      width: 104,
      fixed: 'right',
      align: 'center',
      useSlot: true
    }
  ]
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '可排工单',
      value: schedulableOrders.value.length,
      description: '已确认且未结案',
      icon: 'ri:file-list-3-line'
    },
    {
      label: '待排工序',
      value: state.tasks.filter((task) => scheduleRisk(task, conflicts.value) === 'unassigned')
        .length,
      description: '尚未形成完整资源计划',
      icon: 'ri:time-line',
      tone: 'warning'
    },
    {
      label: '资源冲突',
      value: conflicts.value.size,
      description: '同一中心计划周期重叠',
      icon: 'ri:alarm-warning-line',
      tone: conflicts.value.size ? 'danger' : 'success'
    },
    {
      label: '已排工序',
      value: state.tasks.filter((task) => task.schedulingStatus === 'scheduled').length,
      description: '可进入现场执行',
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    }
  ])

  function tasksForOrder(orderId: string): MesOperationTask[] {
    return state.tasks
      .filter((task) => task.workOrderId === orderId)
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
  }

  function scheduleProgress(orderId: string): number {
    const tasks = tasksForOrder(orderId)
    if (!tasks.length) return 0
    const scheduled = tasks.filter(
      (task) => task.workCenterId && task.schedulingStatus !== 'pending'
    ).length
    return Math.round((scheduled / tasks.length) * 100)
  }

  function workCenterName(id: string | null): string {
    if (!id) return '待分配'
    return state.workCenters.find((center) => center.id === id)?.name || '未知工作中心'
  }

  function riskMeta(task: MesOperationTask): { label: string; type: TagProps['type'] } {
    const risk = scheduleRisk(task, conflicts.value)
    const types: Record<typeof risk, TagProps['type']> = {
      conflict: 'danger',
      overdue: 'warning',
      unassigned: 'warning',
      healthy: 'success'
    }
    return { label: scheduleRiskLabel(risk), type: types[risk] }
  }

  function openSchedule(row: MesOperationTask): void {
    void scheduleDialogRef.value?.handleOpen({ row, workCenters: state.workCenters })
  }

  function goToWorkOrders(): void {
    void router.push('/mes/production-plan/work-order')
  }

  let requestId = 0
  async function loadWorkspace(): Promise<void> {
    const request = ++requestId
    state.loading = true
    state.error = ''
    try {
      await tenantScopeStore.loadTenantOptions()
      const tenantId = effectiveTenantId.value || undefined
      const [orders, tasks, references] = await Promise.all([
        fetchWorkOrders({ current: 1, size: 300, tenantId }),
        fetchOperationTasks({ current: 1, size: 1000, tenantId }),
        fetchMesReferences(tenantId)
      ])
      if (request !== requestId) return
      state.orders = orders.data
      state.tasks = tasks.data
      state.workCenters = references.workCenters
      if (!queueOrders.value.some((order) => order.id === selectedOrderId.value)) {
        selectedOrderId.value =
          queueOrders.value.find((order) => order.status === 'confirmed')?.id ||
          queueOrders.value[0]?.id ||
          ''
      }
    } catch {
      if (request === requestId) state.error = '排产数据加载失败，请检查网络后重试。'
    } finally {
      if (request === requestId) state.loading = false
    }
  }

  watch(effectiveTenantId, loadWorkspace, { immediate: true })
</script>

<style scoped lang="scss">
  .scheduling-page {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;
    min-height: 0;

    &.is-focus-mode {
      gap: 0;
    }

    &__workspace {
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
      gap: var(--art-space-3);
      min-width: 0;
      height: 0;
      min-height: 0;

      > :deep(.art-section-card) {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        overflow: hidden;
      }

      :deep(.art-section-card__header) {
        flex: none;
        margin-bottom: var(--art-space-3);
      }

      :deep(.scheduling-page__card-body) {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
      }

      :deep(.art-async-state__empty) {
        flex: 1;
      }
    }

    &__queue-tools {
      display: grid;
      flex: none;
      gap: 6px;
      padding-bottom: var(--art-space-3);

      > span {
        font-size: 11px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }

    &__order-scrollbar {
      flex: 1;
      min-width: 0;
      min-height: 0;
    }

    &__order-scrollbar :deep(.el-scrollbar__view) {
      min-height: 100%;
    }

    &__order-list {
      display: grid;
      gap: var(--art-space-2);
      padding-right: var(--art-space-2);
      padding-bottom: 2px;
    }

    &__order {
      position: relative;
      display: grid;
      gap: 7px;
      width: 100%;
      padding: 13px 14px 12px;
      overflow: hidden;
      color: var(--el-text-color-primary);
      text-align: left;
      cursor: pointer;
      background: var(--art-gray-100);
      border: 1px solid transparent;
      border-radius: var(--art-control-radius);
      transition:
        border-color 0.18s ease,
        background-color 0.18s ease;

      &:hover,
      &:focus-visible,
      &.is-active {
        outline: none;
        background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
        border-color: color-mix(in srgb, var(--theme-color) 45%, var(--el-border-color));
      }

      > i {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: var(--theme-color);
      }
    }

    &__order-head,
    &__order-foot {
      display: flex;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: space-between;
      min-width: 0;
    }

    &__order-head strong {
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 14px;
      white-space: nowrap;
    }

    &__product,
    &__order-foot {
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }

    &__order-blocker {
      display: flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: var(--el-color-danger);
      white-space: nowrap;

      :deep(.art-svg-icon) {
        flex: none;
      }
    }

    &__order-meta {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__health {
      display: grid;
      flex: none;
      grid-template-columns: repeat(3, minmax(110px, 0.7fr)) minmax(240px, 1.5fr);
      margin-bottom: var(--art-space-3);
      background: var(--art-gray-100);
      border-radius: var(--art-control-radius);

      > div {
        display: grid;
        gap: 3px;
        padding: 11px 14px;

        &:not(:last-child) {
          border-right: 1px solid var(--el-border-color-lighter);
        }
      }

      span {
        display: flex;
        gap: 6px;
        align-items: center;
        font-size: 11px;
        color: var(--el-text-color-secondary);

        i {
          width: 7px;
          height: 7px;
          border-radius: 50%;

          &.is-primary {
            background: var(--theme-color);
          }

          &.is-warning {
            background: var(--el-color-warning);
          }

          &.is-danger {
            background: var(--el-color-danger);
          }

          &.is-info {
            background: var(--el-color-info);
          }
        }
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 16px;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__task-table {
      flex: 1;
      min-width: 0;
      min-height: 0;
    }

    &__sequence {
      font-variant-numeric: tabular-nums;
      color: var(--theme-color);
    }

    &__operation-name {
      display: grid;
      gap: 3px;

      strong {
        color: var(--el-text-color-primary);
      }

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__planned-period {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    &__queue-empty {
      flex: 1;
      min-height: 280px;
    }

    @media (width <= 1100px) {
      &__workspace {
        grid-template-columns: 280px minmax(0, 1fr);
      }

      &__health {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__health > div:nth-child(2) {
        border-right: 0;
      }

      &__health > div:nth-child(-n + 2) {
        border-bottom: 1px solid var(--el-border-color-lighter);
      }
    }

    @media (width <= 760px) {
      &__workspace {
        grid-template-rows: minmax(360px, auto) minmax(460px, auto);
        grid-template-columns: 1fr;
        height: auto;
        overflow: visible;
      }

      &__workspace > :deep(.art-section-card) {
        height: auto;
      }

      &__order-list {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }

      &__order-scrollbar,
      &__task-table {
        min-height: 280px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &__order {
        transition: none;
      }
    }
  }
</style>
