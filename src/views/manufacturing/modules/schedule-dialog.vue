<template>
  <ArtDialog ref="dialogRef" size="sm"
    ><ArtForm
      ref="formRef"
      v-model="model"
      :items="items"
      :rules="rules"
      label-position="top"
      :show-reset="false"
      :show-submit="false"
  /></ArtDialog>
</template>
<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { MesOperationTask, MesReferenceOption } from '@mes/api'
  import { transitionOperationTask } from '@mes/api'
  export interface ScheduleDialogOpenData {
    row: MesOperationTask
    workCenters: MesReferenceOption[]
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<ScheduleDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const model = reactive({ workCenterId: '' })
  const centers = ref<MesReferenceOption[]>([])
  const items = computed<FormItem[]>(() => [
    {
      key: 'workCenterId',
      label: '目标工作中心',
      type: 'select',
      span: 24,
      options: centers.value.map((item) => ({
        label: `${item.name} · ${item.code}`,
        value: item.id
      })),
      props: { filterable: true, placeholder: '选择承接本工序的工作中心' },
      help: '排程后任务进入“已排程”，可继续现场执行。'
    }
  ])
  const rules = { workCenterId: [{ required: true, message: '请选择工作中心', trigger: 'change' }] }
  const handleOpen = async (data: ScheduleDialogOpenData) => {
    centers.value = data.workCenters
    model.workCenterId = data.row.workCenterId || ''
    await dialogRef.value?.handleOpen(data, {
      title: '工序任务排程',
      subtitle: `${data.row.operationCode} · ${data.row.operationName}`,
      confirmText: '确认排程',
      onOpen: () => formRef.value?.clearValidate(),
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          await transitionOperationTask(data.row.id, 'schedule', model.workCenterId)
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
