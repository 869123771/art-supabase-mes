<template>
  <ArtDialog ref="dialogRef" size="sm">
    <div class="task-due-date">
      <ArtEntitySummary
        class="task-due-date__context"
        icon="ri:calendar-check-line"
        eyebrow="REQUIRED COMPLETION"
        :title="taskTitle"
        :description="`${taskNo} · 调整工序要求完工日期，不改变生产工单的计划完工日期。`"
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
  import { updateOperationTaskDueDate, type MesOperationTask } from '@mes/api'

  export interface TaskDueDateDialogOpenData {
    row: MesOperationTask
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<TaskDueDateDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const taskId = ref('')
  const taskNo = ref('')
  const taskTitle = ref('工序任务')
  const model = reactive({ requiredCompletionDate: '' })
  const items: FormItem[] = [
    {
      key: 'requiredCompletionDate',
      label: '工序要求完工日期',
      type: 'date',
      span: 24,
      props: {
        valueFormat: 'YYYY-MM-DD',
        class: '!w-full',
        placeholder: '选择工序要求完工日期'
      },
      help: '已关闭工序不可修改；默认继承生产工单计划完工日期。'
    }
  ]
  const rules = {
    requiredCompletionDate: [
      { required: true, message: '请选择工序要求完工日期', trigger: 'change' }
    ]
  }

  async function handleOpen(data: TaskDueDateDialogOpenData): Promise<void> {
    taskId.value = data.row.id
    taskNo.value = data.row.taskNo
    taskTitle.value = data.row.operationName || '工序任务'
    model.requiredCompletionDate = data.row.requiredCompletionDate || ''
    await dialogRef.value?.handleOpen(data, {
      title: '维护要求完工日期',
      subtitle: data.row.workOrder?.workOrderNo || data.row.taskNo,
      confirmText: '更新日期',
      onOpen: () => formRef.value?.clearValidate(),
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          await updateOperationTaskDueDate(taskId.value, model.requiredCompletionDate)
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
  .task-due-date__context {
    margin-bottom: 18px;
  }
</style>
