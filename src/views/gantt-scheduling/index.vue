<template>
  <ArtPermissionGuard permission="MesSchedulingGantt:View" resource-name="甘特图排产">
    <div
      class="gantt-page business-workspace-page art-full-height"
      :class="{ 'is-focus-mode': focusMode }"
    >
      <BusinessWorkspaceHeader
        v-show="!focusMode"
        eyebrow="SCHEDULE TIMELINE"
        title="甘特图排产"
        description="按工作中心展开工序计划时间轴，集中识别资源冲突、延期风险与未分配任务。"
        icon="ri:bar-chart-horizontal-line"
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

      <ArtSectionCard
        class="gantt-page__board business-workspace-content"
        title="资源负荷时间轴"
        :subtitle="`${rangeLabel} · 共 ${visibleTasks.length} 道工序`"
        :loading="state.loading"
        :error="state.error"
        :empty="!state.loading && !state.error && !visibleTasks.length"
        empty-title="当前筛选范围暂无排程"
        empty-description="先确认生产工单以生成工序任务，再到排产页分配工作中心和计划日期；条件变更后本页会自动重新查询。"
        :min-height="0"
        body-class="gantt-page__board-body"
        retryable
        @retry="loadWorkspace"
      >
        <template #actions>
          <div class="gantt-page__filters">
            <BusinessWorkspaceFocusToggle v-if="focusMode" v-model="focusMode" />
            <span class="gantt-page__refresh-state" role="status" aria-live="polite">
              <ArtSvgIcon :icon="state.loading ? 'ri:loader-4-line' : 'ri:refresh-line'" />
              {{ state.loading ? '正在刷新' : `自动刷新 · ${state.lastLoadedAt || '待加载'}` }}
            </span>
            <ElSelect
              v-model="filters.workCenterId"
              clearable
              filterable
              placeholder="全部工作中心"
              aria-label="筛选工作中心"
            >
              <ElOption
                v-for="center in state.workCenters"
                :key="center.id"
                :label="`${center.name} · ${center.code}`"
                :value="center.id"
              />
            </ElSelect>
            <ElDatePicker
              v-model="filters.range"
              type="daterange"
              value-format="YYYY-MM-DD"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              unlink-panels
              :clearable="false"
              aria-label="甘特图日期范围"
            />
            <ElSegmented
              v-model="filters.span"
              :options="spanOptions"
              size="small"
              aria-label="时间轴跨度"
              @change="applySpan"
            />
            <ElButton class="gantt-page__today-button" @click="focusToday">
              <ArtSvgIcon icon="ri:focus-3-line" />
              回到今天
            </ElButton>
          </div>
        </template>

        <template #empty-action>
          <ElButton type="primary" @click="goToScheduling">前往排产</ElButton>
          <ElButton :loading="state.loading" @click="loadWorkspace">刷新数据</ElButton>
        </template>

        <template v-if="visibleTasks.length">
          <div class="gantt-page__legend" aria-label="排程状态图例">
            <strong>状态图例</strong>
            <span><i class="is-scheduled" />已排程</span>
            <span><i class="is-processing" />加工中</span>
            <span><i class="is-warning" />待排 / 逾期</span>
            <span><i class="is-danger" />资源冲突</span>
            <small>拖动底部滚动条浏览日期；点击任务条可排程或查看详情</small>
          </div>

          <ElScrollbar ref="timelineViewport" class="gantt-page__viewport" always>
            <div class="gantt-page__timeline" :style="timelineStyle">
              <div class="gantt-page__corner">
                <strong>工作中心 / 工序</strong>
                <small>按计划开始时间排序</small>
              </div>
              <div class="gantt-page__days">
                <div
                  v-for="day in timelineDays"
                  :key="day.date"
                  class="gantt-page__day"
                  :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
                >
                  <strong>{{ day.label }}</strong>
                  <small>{{ day.weekday }}</small>
                </div>
              </div>

              <template v-for="(task, index) in visibleTasks" :key="task.id">
                <div
                  class="gantt-page__task-info"
                  :class="{ 'is-group-start': isGroupStart(index) }"
                  :style="rowStyle(index)"
                >
                  <span class="gantt-page__task-meta">
                    <span class="gantt-page__center">
                      <i :class="`is-${riskFor(task)}`" />
                      {{ workCenterLabel(task.workCenterId) }}
                    </span>
                    <small :class="`is-${riskFor(task)}`">{{
                      scheduleRiskLabel(riskFor(task))
                    }}</small>
                  </span>
                  <span class="gantt-page__task-name">
                    <strong :title="task.operationName">{{ task.operationName }}</strong>
                    <b>{{ task.sequenceNo }}</b>
                  </span>
                  <small :title="task.workOrder?.workOrderNo">
                    {{ task.workOrder?.workOrderNo || '未关联工单' }} · {{ task.operationCode }}
                  </small>
                </div>
                <div
                  class="gantt-page__lane"
                  :class="{ 'is-group-start': isGroupStart(index) }"
                  :style="rowStyle(index)"
                >
                  <span
                    v-for="day in timelineDays"
                    :key="day.date"
                    class="gantt-page__grid-cell"
                    :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
                  />
                  <ArtTooltip :content="taskTooltip(task)" placement="top" :show-after="300">
                    <button
                      type="button"
                      class="gantt-page__bar"
                      :class="[`is-${task.status}`, `is-${riskFor(task)}`]"
                      :style="barStyle(task)"
                      :aria-label="`${task.operationName}，${taskTooltip(task)}`"
                      @click="openTask(task)"
                    >
                      <span>{{ task.operationName }}</span>
                      <small>{{ durationLabel(task) }}</small>
                    </button>
                  </ArtTooltip>
                </div>
              </template>
            </div>
          </ElScrollbar>
        </template>
      </ArtSectionCard>

      <ScheduleDialog ref="scheduleDialogRef" @success="loadWorkspace" />
      <TaskDetailDialog ref="taskDetailDialogRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { computed, nextTick, reactive, ref, watch, type CSSProperties } from 'vue'
  import { useRouter } from 'vue-router'
  import { storeToRefs } from 'pinia'
  import type { ScrollbarInstance } from 'element-plus'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTooltip from '@/components/core/feedback/art-tooltip/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessWorkspaceFocusToggle from '@/components/business/business-workspace-focus-toggle/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useWorkspaceFocus } from '@/hooks/core/useWorkspaceFocus'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    fetchMesReferences,
    fetchOperationTasks,
    type MesOperationTask,
    type MesReferenceOption
  } from '@mes/api'
  import ScheduleDialog, {
    type ScheduleDialogOpenData
  } from '../manufacturing/modules/schedule-dialog.vue'
  import TaskDetailDialog, {
    type TaskDetailDialogOpenData
  } from '../manufacturing/modules/task-detail-dialog.vue'
  import {
    conflictTaskIds,
    scheduleRisk,
    scheduleRiskLabel,
    taskEndDate,
    taskStartDate,
    type ScheduleRisk
  } from '../scheduling/modules/schedule-policy'

  defineOptions({ name: 'MesSchedulingGantt' })
  const declaredPermissions = [
    'MesSchedulingGantt:View',
    'MesOperationTask:Schedule',
    'MesOperationTask:View'
  ] as const
  void declaredPermissions

  const { hasAuth } = useAuth()
  const { focusMode } = useWorkspaceFocus()
  const router = useRouter()
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId } = storeToRefs(tenantScopeStore)
  const scheduleDialogRef = ref<{ handleOpen: (data: ScheduleDialogOpenData) => Promise<void> }>()
  const taskDetailDialogRef = ref<{
    handleOpen: (data: TaskDetailDialogOpenData) => Promise<void>
  }>()
  const timelineViewport = ref<ScrollbarInstance>()
  const state = reactive({
    loading: false,
    error: '',
    lastLoadedAt: '',
    tasks: [] as MesOperationTask[],
    workCenters: [] as MesReferenceOption[]
  })
  const filters = reactive({
    range: [
      dayjs().subtract(2, 'day').format('YYYY-MM-DD'),
      dayjs().add(11, 'day').format('YYYY-MM-DD')
    ] as [string, string],
    span: 14,
    workCenterId: ''
  })
  const spanOptions = [
    { label: '7 天', value: 7 },
    { label: '14 天', value: 14 },
    { label: '30 天', value: 30 }
  ]
  const workspaceTags: BusinessWorkspaceTag[] = [
    { label: '工作中心负荷', type: 'primary' },
    { label: '冲突识别', type: 'danger' },
    { label: '计划联动', type: 'success' }
  ]
  const conflicts = computed(() => conflictTaskIds(state.tasks))
  const timelineDays = computed(() => {
    const start = dayjs(filters.range[0])
    const count = Math.max(dayjs(filters.range[1]).diff(start, 'day') + 1, 1)
    return Array.from({ length: count }, (_, index) => {
      const date = start.add(index, 'day')
      return {
        date: date.format('YYYY-MM-DD'),
        label: date.format('MM/DD'),
        weekday: `周${'日一二三四五六'[date.day()]}`,
        isToday: date.isSame(dayjs(), 'day'),
        isWeekend: [0, 6].includes(date.day())
      }
    })
  })
  const visibleTasks = computed(() =>
    state.tasks
      .filter((task) => !filters.workCenterId || task.workCenterId === filters.workCenterId)
      .filter((task) => {
        const start = taskStartDate(task)
        const end = taskEndDate(task)
        if (!start || !end) return true
        return (
          !dayjs(end).isBefore(filters.range[0], 'day') &&
          !dayjs(start).isAfter(filters.range[1], 'day')
        )
      })
      .sort((left, right) => {
        const centerCompare = workCenterName(left.workCenterId).localeCompare(
          workCenterName(right.workCenterId),
          'zh-CN'
        )
        if (centerCompare) return centerCompare
        return (
          (taskStartDate(left) || '').localeCompare(taskStartDate(right) || '') ||
          left.sequenceNo - right.sequenceNo
        )
      })
  )
  const rangeLabel = computed(() => `${filters.range[0]} 至 ${filters.range[1]}`)
  const timelineStyle = computed<CSSProperties>(() => ({
    '--day-count': timelineDays.value.length,
    '--day-width': filters.span >= 30 ? '66px' : filters.span <= 7 ? '112px' : '88px',
    '--timeline-height': `${visibleTasks.value.length * 72 + 56}px`
  }))
  const metrics = computed<BusinessWorkspaceMetric[]>(() => {
    const visible = visibleTasks.value
    const overdue = visible.filter((task) => riskFor(task) === 'overdue').length
    const unassigned = visible.filter((task) => riskFor(task) === 'unassigned').length
    return [
      {
        label: '时间轴工序',
        value: visible.length,
        description: '当前筛选范围',
        icon: 'ri:git-merge-line'
      },
      {
        label: '工作中心',
        value: new Set(visible.map((task) => task.workCenterId).filter(Boolean)).size,
        description: '参与当前排程',
        icon: 'ri:building-2-line'
      },
      {
        label: '资源冲突',
        value: visible.filter((task) => conflicts.value.has(task.id)).length,
        description: '计划周期存在重叠',
        icon: 'ri:alarm-warning-line',
        tone: conflicts.value.size ? 'danger' : 'success'
      },
      {
        label: '计划风险',
        value: overdue + unassigned,
        description: `${unassigned} 待排 · ${overdue} 逾期`,
        icon: 'ri:time-line',
        tone: overdue + unassigned ? 'warning' : 'success'
      }
    ]
  })

  function applySpan(value: string | number | boolean): void {
    const span = Number(value)
    const start = dayjs(filters.range[0])
    filters.range = [start.format('YYYY-MM-DD'), start.add(span - 1, 'day').format('YYYY-MM-DD')]
    nextTick(() => timelineViewport.value?.scrollTo({ left: 0, behavior: 'smooth' }))
  }

  function focusToday(): void {
    const start = dayjs()
    filters.range = [
      start.format('YYYY-MM-DD'),
      start.add(filters.span - 1, 'day').format('YYYY-MM-DD')
    ]
    nextTick(() => timelineViewport.value?.scrollTo({ left: 0, behavior: 'smooth' }))
  }

  function workCenterName(id: string | null): string {
    if (!id) return '未分配工作中心'
    return state.workCenters.find((center) => center.id === id)?.name || '未知工作中心'
  }

  function workCenterLabel(id: string | null): string {
    if (!id) return '未分配工作中心'
    const center = state.workCenters.find((item) => item.id === id)
    return center ? `${center.name} · ${center.code}` : '未知工作中心'
  }

  function isGroupStart(index: number): boolean {
    if (index === 0) return true
    return (
      workCenterName(visibleTasks.value[index]?.workCenterId ?? null) !==
      workCenterName(visibleTasks.value[index - 1]?.workCenterId ?? null)
    )
  }

  function riskFor(task: MesOperationTask): ScheduleRisk {
    return scheduleRisk(task, conflicts.value)
  }

  function rowStyle(index: number): CSSProperties {
    return { gridRow: `${index + 2}` }
  }

  function barStyle(task: MesOperationTask): CSSProperties {
    const rangeStart = dayjs(filters.range[0])
    const rangeEnd = dayjs(filters.range[1])
    const startValue = taskStartDate(task)
    const endValue = taskEndDate(task)
    const start = startValue ? dayjs(startValue) : rangeStart
    const end = endValue ? dayjs(endValue) : start
    const clippedStart = start.isBefore(rangeStart, 'day') ? rangeStart : start
    const clippedEnd = end.isAfter(rangeEnd, 'day') ? rangeEnd : end
    const total = Math.max(timelineDays.value.length, 1)
    const offset = Math.max(clippedStart.diff(rangeStart, 'day'), 0)
    const duration = Math.max(clippedEnd.diff(clippedStart, 'day') + 1, 1)
    return {
      left: `calc(${(offset / total) * 100}% + 4px)`,
      width: `calc(${(duration / total) * 100}% - 8px)`
    }
  }

  function durationLabel(task: MesOperationTask): string {
    const start = taskStartDate(task)
    const end = taskEndDate(task)
    if (!start || !end) return '日期待定'
    return `${dayjs(end).diff(start, 'day') + 1} 天`
  }

  function taskTooltip(task: MesOperationTask): string {
    return `${workCenterName(task.workCenterId)} · ${taskStartDate(task) || '待定'} 至 ${taskEndDate(task) || '待定'} · ${scheduleRiskLabel(riskFor(task))}`
  }

  function openTask(row: MesOperationTask): void {
    if (['unscheduled', 'scheduled'].includes(row.status) && hasAuth('MesOperationTask:Schedule')) {
      void scheduleDialogRef.value?.handleOpen({ row, workCenters: state.workCenters })
      return
    }
    void taskDetailDialogRef.value?.handleOpen({ row, workCenters: state.workCenters })
  }

  function goToScheduling(): void {
    void router.push('/mes/production-plan/scheduling')
  }

  let requestId = 0
  async function loadWorkspace(): Promise<void> {
    const request = ++requestId
    state.loading = true
    state.error = ''
    try {
      await tenantScopeStore.loadTenantOptions()
      const tenantId = effectiveTenantId.value || undefined
      const [tasks, references] = await Promise.all([
        fetchOperationTasks({
          current: 1,
          size: 1200,
          tenantId,
          workCenterId: filters.workCenterId || undefined
        }),
        fetchMesReferences(tenantId)
      ])
      if (request !== requestId) return
      state.tasks = tasks.data
      state.workCenters = references.workCenters
      state.lastLoadedAt = dayjs().format('HH:mm:ss')
    } catch {
      if (request === requestId) state.error = '甘特图排产数据加载失败，请稍后重试。'
    } finally {
      if (request === requestId) state.loading = false
    }
  }

  watch(
    () => [effectiveTenantId.value, filters.workCenterId, filters.range[0], filters.range[1]],
    loadWorkspace,
    { immediate: true }
  )
</script>

<style scoped lang="scss">
  .gantt-page {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;
    min-height: 0;

    &.is-focus-mode {
      gap: 0;
    }

    &__board {
      display: flex;
      flex: 1;
      flex-direction: column;
      height: 0;
      min-height: 0;
      overflow: hidden;

      :deep(.gantt-page__board-body) {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
      }

      :deep(.art-async-state__empty) {
        flex: 1;
      }
    }

    &__filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: flex-end;
      padding: 6px;
      background: var(--art-gray-100);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);

      > .el-select {
        width: 210px;
      }

      > .el-date-editor {
        width: 260px;
      }
    }

    &__refresh-state {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-height: 32px;
      padding: 0 10px;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
      background: var(--default-box-color);
      border-right: 1px solid var(--el-border-color-lighter);
      border-radius: calc(var(--art-control-radius) - 2px);
    }

    &__today-button {
      margin-left: 0;
    }

    &__legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
      padding: 9px 12px;
      margin-bottom: var(--art-space-3);
      font-size: 12px;
      color: var(--el-text-color-secondary);
      background: var(--art-gray-100);
      border-radius: var(--art-control-radius);

      > strong {
        padding-right: 12px;
        font-size: 12px;
        color: var(--el-text-color-primary);
        border-right: 1px solid var(--el-border-color);
      }

      span {
        display: inline-flex;
        gap: 6px;
        align-items: center;
      }

      i {
        width: 8px;
        height: 8px;
        border-radius: 2px;
      }

      i.is-scheduled {
        background: var(--theme-color);
      }

      i.is-processing {
        background: var(--el-color-success);
      }

      i.is-warning {
        background: var(--el-color-warning);
      }

      i.is-danger {
        background: var(--el-color-danger);
      }

      small {
        margin-left: auto;
        color: var(--el-text-color-placeholder);
      }
    }

    &__viewport {
      flex: 1;
      min-width: 0;
      min-height: 0;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--el-border-color) 35%, transparent);

      :deep(.el-scrollbar__view) {
        min-height: 100%;
      }
    }

    &__timeline {
      --task-column-width: 300px;
      --day-width: 88px;

      position: relative;
      display: grid;
      grid-template-rows: 56px repeat(auto-fill, 72px);
      grid-template-columns: var(--task-column-width) calc(var(--day-count) * var(--day-width));
      width: calc(var(--task-column-width) + var(--day-count) * var(--day-width));
      min-height: var(--timeline-height);
      background: var(--default-box-color);
    }

    &__corner,
    &__task-info {
      position: sticky;
      left: 0;
      z-index: 4;
      display: grid;
      align-content: center;
      min-width: 0;
      padding: 9px 16px;
      background: var(--default-box-color);
      border-right: 1px solid var(--el-border-color-lighter);
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__corner {
      top: 0;
      z-index: 6;
      grid-row: 1;

      strong {
        font-size: 12px;
      }

      small {
        margin-top: 2px;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__days {
      position: sticky;
      top: 0;
      z-index: 5;
      display: grid;
      grid-template-columns: repeat(var(--day-count), var(--day-width));
      grid-row: 1;
      grid-column: 2;
      background: var(--art-gray-100);
      box-shadow: 0 3px 8px color-mix(in srgb, var(--el-text-color-primary) 7%, transparent);
    }

    &__day {
      display: grid;
      place-content: center;
      text-align: center;
      border-right: 1px solid var(--el-border-color-lighter);
      border-bottom: 1px solid var(--el-border-color-lighter);

      strong {
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }

      small {
        margin-top: 2px;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      &.is-weekend {
        background: color-mix(in srgb, var(--el-color-info) 5%, transparent);
      }

      &.is-today {
        color: var(--theme-color);
        box-shadow: inset 0 2px 0 var(--theme-color);
      }
    }

    &__task-info {
      grid-column: 1;

      &.is-group-start {
        box-shadow: inset 0 2px 0 color-mix(in srgb, var(--theme-color) 20%, transparent);
      }

      > strong,
      > small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      > small {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__task-meta,
    &__task-name {
      display: flex;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: space-between;
      min-width: 0;
    }

    &__task-meta > small {
      flex: none;
      font-size: 10px;
      color: var(--el-text-color-secondary);

      &.is-conflict {
        color: var(--el-color-danger);
      }

      &.is-overdue,
      &.is-unassigned {
        color: var(--el-color-warning-dark-2);
      }
    }

    &__task-name {
      margin: 2px 0 1px;

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      b {
        flex: none;
        min-width: 28px;
        font-size: 11px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--theme-color);
        text-align: right;
      }
    }

    &__center {
      display: flex;
      gap: 6px;
      align-items: center;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;

      i {
        flex: 0 0 7px;
        width: 7px;
        height: 7px;
        background: var(--el-color-success);
        border-radius: 50%;

        &.is-conflict {
          background: var(--el-color-danger);
        }

        &.is-overdue,
        &.is-unassigned {
          background: var(--el-color-warning);
        }
      }
    }

    &__lane {
      position: relative;
      display: grid;
      grid-template-columns: repeat(var(--day-count), var(--day-width));
      grid-column: 2;
      overflow: hidden;
      border-bottom: 1px solid var(--el-border-color-lighter);

      &.is-group-start {
        box-shadow: inset 0 2px 0 color-mix(in srgb, var(--theme-color) 20%, transparent);
      }
    }

    &__grid-cell {
      border-right: 1px solid var(--el-border-color-lighter);

      &.is-weekend {
        background: color-mix(in srgb, var(--el-color-info) 4%, transparent);
      }

      &.is-today {
        background: color-mix(in srgb, var(--theme-color) 6%, transparent);
      }
    }

    &__bar {
      position: absolute;
      top: 18px;
      z-index: 2;
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      min-width: 42px;
      height: 36px;
      padding: 0 10px;
      overflow: hidden;
      color: var(--el-color-primary-dark-2);
      cursor: pointer;
      background: var(--el-color-primary-light-8);
      border: 1px solid var(--el-color-primary-light-5);
      border-radius: 7px;

      &:hover,
      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--theme-color) 45%, transparent);
        outline-offset: 1px;
      }

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }

      small {
        flex: none;
        font-size: 10px;
        opacity: 0.78;
      }

      &.is-processing {
        color: var(--el-color-success-dark-2);
        background: var(--el-color-success-light-8);
        border-color: var(--el-color-success-light-5);
      }

      &.is-overdue,
      &.is-unassigned {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-8);
        border-color: var(--el-color-warning-light-5);
      }

      &.is-conflict {
        color: var(--el-color-danger-dark-2);
        background: var(--el-color-danger-light-8);
        border-color: var(--el-color-danger-light-5);
      }

      &.is-closed {
        color: var(--el-text-color-secondary);
        background: var(--art-gray-200);
        border-color: var(--el-border-color);
      }
    }

    @media (width <= 1000px) {
      &__filters {
        justify-content: flex-start;
      }

      &__refresh-state {
        width: 100%;
        border-right: 0;
        border-bottom: 1px solid var(--el-border-color-lighter);
      }

      &__legend small {
        width: 100%;
        margin-left: 0;
      }

      &__timeline {
        --task-column-width: 230px;
        --day-width: 78px;
      }
    }

    @media (width <= 640px) {
      &__filters,
      &__filters > .el-select,
      &__filters > .el-date-editor {
        width: 100%;
      }

      &__board {
        height: auto;
        min-height: 560px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &__viewport :deep(.el-scrollbar__wrap) {
        scroll-behavior: auto;
      }
    }
  }
</style>
