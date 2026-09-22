<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="grid gap-4">
      <ArtEntitySummary
        icon="ri:layout-grid-line"
        eyebrow="BOARD PACKING SPEC"
        :title="board?.boardNo || '包装参数'"
        description="轴线用于隔离包，厚度与单块重量用于计算堆叠高度和总重量。"
      />
      <ArtForm
        ref="formRef"
        v-model="model"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="24"
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
  import { savePackingBoardSpec, type WorkOrderBoard } from '@mes/api'

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<WorkOrderBoard>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const board = ref<WorkOrderBoard>()
  const model = reactive({ axis: '', thicknessMm: 0, unitWeightKg: null as number | null })
  const items: FormItem[] = [
    { key: 'axis', label: '轴线', type: 'input', props: { maxlength: 80 } },
    { key: 'thicknessMm', label: '成品厚度 mm', type: 'number', props: { min: 1 } },
    { key: 'unitWeightKg', label: '单块重量 kg（选填）', type: 'number', props: { min: 0 } }
  ]
  const rules = {
    axis: [{ required: true, message: '请填写轴线', trigger: 'blur' }],
    thicknessMm: [{ required: true, message: '请填写成品厚度', trigger: 'change' }]
  }
  async function handleOpen(row: WorkOrderBoard): Promise<void> {
    board.value = row
    Object.assign(model, {
      axis: row.axis,
      thicknessMm: row.thicknessMm,
      unitWeightKg: row.unitWeightKg
    })
    await dialogRef.value?.handleOpen(row, {
      title: '包装参数',
      subtitle: `${row.area} · ${row.boardNo}`,
      confirmText: '保存参数',
      onOpen: () => formRef.value?.clearValidate(),
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          if (!model.axis.trim() || model.thicknessMm <= 0) {
            ElMessage.warning('请填写轴线和有效厚度')
            return false
          }
          await savePackingBoardSpec(
            row.id,
            model.axis.trim(),
            model.thicknessMm,
            model.unitWeightKg
          )
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
