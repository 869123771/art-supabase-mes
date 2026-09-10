<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="task-detail">
      <ArtEntitySummary
        icon="ri:git-merge-line"
        eyebrow="OPERATION TASK"
        :title="record.operationName || '工序任务'"
        :description="`${record.operationCode || '—'} · ${record.workOrder?.workOrderNo || '未关联工单'}`"
      />

      <section v-for="section in sections" :key="section.title" class="task-detail__section">
        <ArtSectionTitle :title="section.title" />
        <ArtDescriptions
          :data="record"
          :items="section.items"
          :columns="2"
          :tablet-columns="2"
          :mobile-columns="1"
          empty-text="—"
        />
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import type { MesOperationTask, MesReferenceOption } from '@mes/api'

  export interface TaskDetailDialogOpenData {
    row: MesOperationTask
    workCenters: MesReferenceOption[]
  }

  const dialogRef = ref<ArtDialogExpose<TaskDetailDialogOpenData>>()
  const record = ref<MesOperationTask>({} as MesOperationTask)
  const workCenters = ref<MesReferenceOption[]>([])
  const sections = computed<
    Array<{ title: string; items: ArtDescriptionItem<MesOperationTask>[] }>
  >(() => [
    {
      title: '任务识别',
      items: [
        {
          key: 'workOrderNo',
          label: '工单编号',
          value: (row: MesOperationTask) => row.workOrder?.workOrderNo,
          copyable: true
        },
        { key: 'sequenceNo', label: '工序序号', field: 'sequenceNo', format: 'number' },
        { key: 'operationCode', label: '工序编码', field: 'operationCode', copyable: true },
        { key: 'operationName', label: '工序名称', field: 'operationName' },
        {
          key: 'status',
          label: '任务状态',
          field: 'status',
          dictCode: 'mesOperationTaskStatus',
          dictDisplay: 'tag'
        },
        {
          key: 'workCenterId',
          label: '工作中心',
          field: 'workCenterId',
          formatter: (value) =>
            workCenters.value.find((item) => item.id === value)?.name || '未排程'
        }
      ]
    },
    {
      title: '计划与执行',
      items: [
        {
          key: 'material',
          label: '产品',
          value: (row: MesOperationTask) =>
            [row.workOrder?.materialCodeSnapshot, row.workOrder?.materialNameSnapshot]
              .filter(Boolean)
              .join(' · ')
        },
        {
          key: 'sequenceType',
          label: '序列类型',
          field: 'sequenceType',
          dictCode: 'mdmProcessRouteSequenceType',
          dictDisplay: 'text'
        },
        { key: 'plannedQuantity', label: '计划数量', field: 'plannedQuantity', format: 'number' },
        {
          key: 'reportedGoodQuantity',
          label: '良品数量',
          field: 'reportedGoodQuantity',
          format: 'number'
        },
        {
          key: 'reportedBadQuantity',
          label: '不良数量',
          field: 'reportedBadQuantity',
          format: 'number'
        },
        { key: 'plannedStartDate', label: '计划开始', field: 'plannedStartDate', format: 'date' },
        { key: 'plannedEndDate', label: '计划结束', field: 'plannedEndDate', format: 'date' },
        { key: 'closedAt', label: '关闭时间', field: 'closedAt', format: 'datetime' },
        { key: 'processContent', label: '工艺内容', field: 'processContent', span: 2 },
        { key: 'remark', label: '备注', field: 'remark', span: 2 },
        { key: 'updateTime', label: '更新时间', field: 'updateTime', format: 'datetime' }
      ]
    }
  ])

  async function handleOpen(data: TaskDetailDialogOpenData): Promise<void> {
    record.value = data.row
    workCenters.value = data.workCenters
    await dialogRef.value?.handleOpen(data, {
      title: '工序任务详情',
      subtitle: data.row.workOrder?.workOrderNo || data.row.operationCode,
      showFooter: false,
      contentMaxHeight: '72vh'
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .task-detail {
    display: grid;
    gap: 22px;

    :deep(.el-descriptions__label) {
      width: 132px;
    }
  }
</style>
