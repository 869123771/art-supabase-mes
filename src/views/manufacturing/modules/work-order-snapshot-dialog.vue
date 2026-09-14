<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="work-order-snapshot">
      <ArtEntitySummary
        class="work-order-snapshot__context"
        :icon="mode === 'bom' ? 'ri:organization-chart' : 'ri:git-branch-line'"
        eyebrow="WORK ORDER SNAPSHOT"
        :title="record?.workOrderNo || '生产工单'"
        :description="summaryDescription"
      />

      <ArtSectionCard
        v-if="mode === 'bom'"
        title="BOM 组件"
        :subtitle="bomSubtitle"
        :empty="bomItems.length === 0"
        empty-title="当前工单没有 BOM 组件"
        empty-description="请先为物料维护 BOM，再保存待确认工单以重新集成。"
      >
        <ArtTable
          v-if="bomItems.length"
          :data="bomItems"
          :columns="bomColumns"
          row-key="id"
          table-layout="fixed"
          :pagination="false"
          scrollbar-always-on
        />
      </ArtSectionCard>

      <ArtSectionCard
        v-else
        title="工艺路线"
        :subtitle="routeSubtitle"
        :empty="routeSteps.length === 0"
        empty-title="当前工单没有工艺路线"
        empty-description="请先为物料维护工艺路线及工序，再保存待确认工单以重新集成。"
      >
        <ArtTable
          v-if="routeSteps.length"
          :data="routeSteps"
          :columns="routeColumns"
          row-key="id"
          table-layout="fixed"
          :pagination="false"
          scrollbar-always-on
        />
      </ArtSectionCard>
    </div>
  </ArtDialog>
</template>

<script setup lang="tsx">
  import { ElTag } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import type { ColumnOption } from '@/types'
  import type {
    MesWorkOrder,
    MesWorkOrderBomItemSnapshot,
    MesWorkOrderRouteStepSnapshot
  } from '@mes/api'

  export type WorkOrderSnapshotMode = 'bom' | 'route'
  export interface WorkOrderSnapshotDialogOpenData {
    row: MesWorkOrder
    mode: WorkOrderSnapshotMode
  }

  const dialogRef = ref<ArtDialogExpose<WorkOrderSnapshotDialogOpenData>>()
  const record = shallowRef<MesWorkOrder>()
  const mode = ref<WorkOrderSnapshotMode>('bom')
  const bom = computed(() => record.value?.bomSnapshot?.[0])
  const bomItems = computed(() => bom.value?.items ?? [])
  const routeSteps = computed(() => record.value?.routeSnapshot?.steps ?? [])
  const summaryDescription = computed(() =>
    mode.value === 'bom'
      ? '展示工单保存时集成的 BOM；未配置组件工序时，系统默认分配到第一道工序。'
      : '展示工单保存时集成的工艺路线；生产工序任务只会在工单确认后生成。'
  )
  const bomSubtitle = computed(() =>
    bom.value
      ? `${bom.value.bomCode || '未编号'} · 版本 ${bom.value.version || '—'} · ${bomItems.value.length} 个组件`
      : '尚未集成 BOM'
  )
  const routeSubtitle = computed(() => {
    const route = record.value?.routeSnapshot
    return route?.id
      ? `${route.name || route.code || '未命名路线'} · ${routeSteps.value.length} 道工序`
      : '尚未集成工艺路线'
  })

  const bomColumns: ColumnOption<MesWorkOrderBomItemSnapshot>[] = [
    { type: 'index', label: '序号', width: 70 },
    { prop: 'componentMaterialCode', label: '组件编码', minWidth: 150 },
    { prop: 'componentMaterialName', label: '组件名称', minWidth: 180 },
    { prop: 'componentSpecification', label: '规格型号', minWidth: 130 },
    { prop: 'quantity', label: '用量', width: 100, align: 'right' },
    { prop: 'positionNo', label: '位号', minWidth: 100 },
    {
      prop: 'assignedOperationName',
      label: '分配工序',
      minWidth: 180,
      formatter: (row) => (
        <span class="work-order-snapshot__assignment">
          <span>{row.assignedOperationName || '未分配'}</span>
          {row.assignmentSource === 'first_operation' && (
            <ElTag size="small" type="info" effect="plain">
              默认首工序
            </ElTag>
          )}
        </span>
      )
    }
  ]
  const routeColumns: ColumnOption<MesWorkOrderRouteStepSnapshot>[] = [
    { type: 'index', label: '顺序', width: 70 },
    { prop: 'code', label: '工序编码', minWidth: 140 },
    { prop: 'name', label: '工序名称', minWidth: 180 },
    { prop: 'sequenceType', label: '序列类型', width: 110 },
    { prop: 'description', label: '工序说明', minWidth: 220, showOverflowTooltip: true }
  ]

  async function handleOpen(data: WorkOrderSnapshotDialogOpenData): Promise<void> {
    record.value = data.row
    mode.value = data.mode
    await dialogRef.value?.handleOpen(data, {
      title: data.mode === 'bom' ? '工单 BOM' : '工单工艺路线',
      subtitle: data.row.materialNameSnapshot,
      showFooter: false,
      contentMaxHeight: '72vh'
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .work-order-snapshot {
    display: grid;
    gap: 18px;
    min-width: 0;

    &__context {
      min-width: 0;
    }

    :deep(.work-order-snapshot__assignment) {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }
  }
</style>
