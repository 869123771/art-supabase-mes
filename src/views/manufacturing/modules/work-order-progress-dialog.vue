<template>
  <ArtDialog ref="dialogRef" size="sm">
    <div class="work-order-progress">
      <ArtEntitySummary
        class="work-order-progress__context"
        :icon="action === 'report' ? 'ri:checkbox-multiple-line' : 'ri:inbox-archive-line'"
        eyebrow="WORK ORDER PROGRESS"
        :title="row?.workOrderNo || ''"
        :description="summary"
      />
      <ArtForm
        ref="formRef"
        v-model="model"
        :items="items"
        :rules="rules"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { recordWorkOrderProgress, type MesWorkOrder } from '@mes/api'

  export interface WorkOrderProgressDialogOpenData {
    row: MesWorkOrder
    action: 'report' | 'deliver'
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<WorkOrderProgressDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const row = ref<MesWorkOrder>()
  const action = ref<'report' | 'deliver'>('report')
  const model = reactive({ quantity: 0 })
  const remaining = computed(() =>
    Math.max(
      0,
      action.value === 'report'
        ? Number(row.value?.orderQuantity || 0) - Number(row.value?.completedQuantity || 0)
        : Number(row.value?.completedQuantity || 0) - Number(row.value?.warehousedQuantity || 0)
    )
  )
  const summary = computed(() =>
    action.value === 'report'
      ? `已报工 ${row.value?.completedQuantity ?? 0} / 工单数量 ${row.value?.orderQuantity ?? 0}；剩余 ${remaining.value}`
      : `已交货 ${row.value?.warehousedQuantity ?? 0} / 已报工 ${row.value?.completedQuantity ?? 0}；可交货 ${remaining.value}`
  )
  const items = computed<FormItem[]>(() => [
    {
      key: 'quantity',
      label: action.value === 'report' ? '本次报工数量' : '本次交货数量',
      type: 'number',
      span: 24,
      props: { min: 0, max: remaining.value, precision: 6, controlsPosition: 'right' },
      help: `本次数量须大于 0，且不能超过 ${remaining.value}。`
    }
  ])
  const rules = {
    quantity: [
      {
        validator: (_rule: unknown, value: number, callback: (error?: Error) => void) => {
          if (!Number.isFinite(value) || value <= 0 || value > remaining.value) {
            callback(new Error(`请输入大于 0 且不超过 ${remaining.value} 的数量`))
          } else callback()
        },
        trigger: 'change'
      }
    ]
  }

  async function handleOpen(data: WorkOrderProgressDialogOpenData): Promise<void> {
    row.value = data.row
    action.value = data.action
    model.quantity = remaining.value
    await dialogRef.value?.handleOpen(data, {
      title: data.action === 'report' ? '工单报工' : '工单交货',
      subtitle: data.row.workOrderNo,
      confirmText: data.action === 'report' ? '确认报工' : '确认交货',
      onOpen: () => formRef.value?.clearValidate(),
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          if (!row.value) return false
          const updated = await recordWorkOrderProgress(row.value.id, action.value, model.quantity)
          if (!updated) return false
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
  .work-order-progress__context {
    margin-bottom: 18px;
  }
</style>
