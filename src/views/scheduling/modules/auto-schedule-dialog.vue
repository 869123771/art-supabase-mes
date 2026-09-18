<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="auto-schedule">
      <ArtEntitySummary
        icon="ri:magic-line"
        eyebrow="FINITE CAPACITY PREVIEW"
        :title="order?.workOrderNo || '自动排产'"
        :description="order ? `${order.materialCodeSnapshot} · ${order.materialNameSnapshot}` : ''"
      />
      <div class="auto-schedule__control">
        <div>
          <label>排产规则</label>
          <ElSelect v-model="ruleId" aria-label="排产规则" filterable @change="preview">
            <ElOption
              v-for="rule in rules"
              :key="rule.id"
              :label="`${rule.name} · ${rule.code}`"
              :value="rule.id"
            />
          </ElSelect>
        </div>
        <ElButton :loading="loading" @click="preview"
          ><ArtSvgIcon icon="ri:refresh-line" />重新预演</ElButton
        >
      </div>
      <ElAlert v-if="error" type="error" :closable="false" :title="error" show-icon />
      <div v-else-if="result" class="auto-schedule__summary">
        <span
          ><strong>{{ result.scheduledCount }}</strong> 道建议</span
        >
        <span
          ><strong>{{ result.skippedCount }}</strong> 道保留</span
        >
        <span
          ><strong>{{ result.warnings.length }}</strong> 条提示</span
        >
        <span>规则：{{ result.ruleName }}</span>
      </div>
      <ElAlert
        v-if="result?.warnings.length"
        type="warning"
        :closable="false"
        :title="result.warnings.join('；')"
        show-icon
      />
      <ArtTable
        :loading="loading"
        :data="result?.proposals || []"
        :columns="columns"
        :pagination="false"
        row-key="taskId"
        height="360px"
        empty-text="暂无可排建议"
        empty-description="检查工序工作中心约束、工单状态或冻结范围。"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    autoScheduleWorkOrder,
    type MesAutoScheduleProposal,
    type MesAutoScheduleResult,
    type MesSchedulingRule,
    type MesWorkOrder
  } from '@mes/api'

  export interface AutoScheduleDialogOpenData {
    order: MesWorkOrder
    rules: MesSchedulingRule[]
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<AutoScheduleDialogOpenData>>()
  const order = ref<MesWorkOrder>()
  const rules = ref<MesSchedulingRule[]>([])
  const ruleId = ref('')
  const loading = ref(false)
  const error = ref('')
  const result = ref<MesAutoScheduleResult>()
  const columns: ColumnOption<MesAutoScheduleProposal>[] = [
    { prop: 'sequenceNo', label: '序列', width: 80 },
    { prop: 'taskNo', label: '任务单号', minWidth: 170 },
    { prop: 'operationName', label: '工序', minWidth: 150 },
    { prop: 'workCenterName', label: '建议工作中心', minWidth: 170 },
    { prop: 'plannedStartDate', label: '计划开始', width: 120 },
    { prop: 'plannedEndDate', label: '计划完工', width: 120 },
    { prop: 'estimatedMinutes', label: '标准分钟', width: 110 },
    { prop: 'durationDays', label: '占用天数', width: 100 }
  ]

  async function preview(): Promise<void> {
    if (!order.value || !ruleId.value) return
    loading.value = true
    error.value = ''
    try {
      result.value = await autoScheduleWorkOrder(order.value.id, ruleId.value, false)
    } catch {
      error.value = '排产预演失败，请检查工序资源、生产日历和规则配置。'
    } finally {
      loading.value = false
    }
  }
  async function handleOpen(data: AutoScheduleDialogOpenData): Promise<void> {
    order.value = data.order
    rules.value = data.rules.filter((item) => item.enabled)
    ruleId.value =
      data.order.schedulingRuleId ||
      rules.value.find((item) => item.isDefault)?.id ||
      rules.value[0]?.id ||
      ''
    result.value = undefined
    error.value = ''
    await dialogRef.value?.handleOpen(data, {
      title: '自动排产预演',
      subtitle: '先核对建议工作中心和计划周期，再一次性应用。',
      confirmText: '应用排产结果',
      contentMaxHeight: '76vh',
      onOpen: preview,
      onConfirm: async () => {
        if (!order.value || !ruleId.value || !result.value?.scheduledCount) return false
        try {
          await autoScheduleWorkOrder(order.value.id, ruleId.value, true)
          emit('success')
          return true
        } catch {
          return false
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .auto-schedule {
    display: grid;
    gap: var(--art-space-3);
    min-width: 0;
  }

  .auto-schedule__control {
    display: flex;
    gap: var(--art-space-3);
    align-items: end;
    padding: 12px 14px;
    background: var(--art-gray-100);
    border-radius: var(--art-control-radius);
  }

  .auto-schedule__control > div {
    display: grid;
    flex: 1;
    gap: 6px;
    min-width: 220px;
  }

  .auto-schedule__control label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .auto-schedule__summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    overflow: hidden;
    background: var(--el-border-color-lighter);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--art-control-radius);
  }

  .auto-schedule__summary span {
    padding: 10px 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    background: var(--default-box-color);
  }

  .auto-schedule__summary strong {
    margin-right: 4px;
    font-size: 16px;
    color: var(--el-text-color-primary);
  }

  @media (width <= 768px) {
    .auto-schedule__control {
      flex-direction: column;
      align-items: stretch;
    }

    .auto-schedule__summary {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
