<template>
  <ArtDialog ref="dialogRef" size="xl" show-fullscreen-button>
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
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { useUserStore } from '@/store/modules/user'
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

  interface WorkOrderBomDisplayItem extends MesWorkOrderBomItemSnapshot {
    assignedOperationSequenceNo: number | null
    assignedOperationSequenceType: string
  }

  const dialogRef = ref<ArtDialogExpose<WorkOrderSnapshotDialogOpenData>>()
  const userStore = useUserStore()
  const record = shallowRef<MesWorkOrder>()
  const mode = ref<WorkOrderSnapshotMode>('bom')
  const bom = computed(() => record.value?.bomSnapshot?.[0])
  const routeSteps = computed(() => record.value?.routeSnapshot?.steps ?? [])
  const routeStepById = computed(
    () => new Map(routeSteps.value.map((routeStep) => [routeStep.id, routeStep]))
  )
  const bomItems = computed<WorkOrderBomDisplayItem[]>(() =>
    (bom.value?.items ?? []).map((item) => {
      const assignedRouteStep = item.assignedRouteStepId
        ? routeStepById.value.get(item.assignedRouteStepId)
        : undefined

      return {
        ...item,
        assignedOperationSequenceNo: assignedRouteStep?.sequenceNo ?? null,
        assignedOperationSequenceType: assignedRouteStep?.sequenceType ?? ''
      }
    })
  )
  const summaryDescription = computed(() =>
    mode.value === 'bom'
      ? '展示工单保存时集成的装配层 BOM；虚拟件自动穿透到下一层，未配置组件工序时默认分配到第一道工序。'
      : '展示工单保存时集成的完整工艺路线与工序参数；生产工序任务只会在工单确认后生成。'
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

  const bomColumns: ColumnOption<WorkOrderBomDisplayItem>[] = [
    { type: 'index', label: '序号', width: 70 },
    { prop: 'componentMaterialCode', label: '组件编码', minWidth: 150 },
    {
      prop: 'componentMaterialName',
      label: '组件名称',
      minWidth: 200,
      formatter: (row) => (
        <span class="work-order-snapshot__assignment">
          <span>{row.componentMaterialName}</span>
          {row.virtualUnexpanded && (
            <ElTag size="small" type="warning" effect="plain">
              虚拟件未展开
            </ElTag>
          )}
        </span>
      )
    },
    { prop: 'componentSpecification', label: '规格型号', minWidth: 130 },
    { prop: 'basicQuantity', label: '基本数量（单台）', width: 150, align: 'right' },
    { prop: 'requiredQuantity', label: '需求数量', width: 120, align: 'right' },
    { prop: 'unitName', label: '单位', width: 90 },
    {
      prop: 'sourcePath',
      label: '展开路径',
      minWidth: 180,
      showOverflowTooltip: true,
      formatter: (row) => row.sourcePath?.join(' → ') || row.componentMaterialCode
    },
    { prop: 'positionNo', label: '位号', minWidth: 100 },
    {
      prop: 'assignedOperationSequenceNo',
      label: '工序序列',
      width: 100,
      align: 'right',
      formatter: (row) => row.assignedOperationSequenceNo ?? '—'
    },
    {
      prop: 'assignedOperationSequenceType',
      label: '序列类型',
      width: 110,
      formatter: (row) =>
        row.assignedOperationSequenceType ? (
          <ArtDictDisplay
            dictCode="mdmProcessRouteSequenceType"
            value={row.assignedOperationSequenceType}
            display="text"
          />
        ) : (
          '—'
        )
    },
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
    { prop: 'sequenceNo', label: '工序序列', width: 96, align: 'right' },
    {
      prop: 'sequenceType',
      label: '序列类型',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay
          dictCode="mdmProcessRouteSequenceType"
          value={row.sequenceType}
          display="text"
        />
      )
    },
    { prop: 'code', label: '工序编码', minWidth: 140 },
    { prop: 'name', label: '工序名称', minWidth: 180 },
    { prop: 'basicBatch', label: '基本批量', width: 100, align: 'right' },
    { prop: 'departmentName', label: '生产车间', minWidth: 130 },
    {
      prop: 'workCenterNames',
      label: '工作中心',
      minWidth: 180,
      formatter: (row) => row.workCenterNames?.join('、') || '全部工作中心'
    },
    { prop: 'runOutputQuantity', label: '单趟产出', width: 110, align: 'right' },
    { prop: 'runProcessingMinutes', label: '单趟加工(分)', width: 126, align: 'right' },
    {
      prop: 'runGreenMinutes',
      label: '单趟绿灯(分)',
      width: 126,
      align: 'right',
      formatter: (row) => row.runGreenMinutes ?? row.runProcessingMinutes
    },
    { prop: 'setupMinutes', label: '调机时长(分)', width: 118, align: 'right' },
    {
      prop: 'humanMachineRatio',
      label: '人机系数',
      width: 96,
      formatter: (row) => `${row.operatorCount}:${row.machineCount}`
    },
    { prop: 'unitName', label: '工序单位', width: 100 },
    {
      prop: 'operationMode',
      label: '工序模式',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay
          dictCode="mdmProcessOperationMode"
          value={row.operationMode}
          display="text"
        />
      )
    },
    {
      prop: 'processingMode',
      label: '加工方式',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay dictCode="mdmProcessingMode" value={row.processingMode} display="text" />
      )
    },
    {
      prop: 'reportMode',
      label: '汇报方式',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay dictCode="mdmReportMode" value={row.reportMode} display="text" />
      )
    },
    {
      prop: 'inspectionMode',
      label: '检验方式',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay dictCode="mdmInspectionMode" value={row.inspectionMode} display="text" />
      )
    },
    {
      prop: 'sequenceControl',
      label: '序列控制',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay dictCode="mdmSequenceControl" value={row.sequenceControl} display="text" />
      )
    },
    {
      prop: 'reworkMode',
      label: '返工方式',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay dictCode="mdmReworkMode" value={row.reworkMode} display="text" />
      )
    },
    {
      prop: 'qualityFlags',
      label: '质量/关键标识',
      minWidth: 170,
      formatter: (row) =>
        [row.needInspection && '需检验', row.firstInspection && '首检', row.critical && '关键工序']
          .filter(Boolean)
          .join('、') || '—'
    },
    { prop: 'description', label: '工序说明', minWidth: 220, showOverflowTooltip: true }
  ]

  async function handleOpen(data: WorkOrderSnapshotDialogOpenData): Promise<void> {
    record.value = data.row
    mode.value = data.mode
    const dictionaryCodes =
      data.mode === 'route'
        ? [
            'mdmProcessRouteSequenceType',
            'mdmProcessOperationMode',
            'mdmProcessingMode',
            'mdmReportMode',
            'mdmInspectionMode',
            'mdmSequenceControl',
            'mdmReworkMode'
          ]
        : ['mdmProcessRouteSequenceType']
    await Promise.all(dictionaryCodes.map((code) => userStore.ensureDictLoaded(code)))
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
