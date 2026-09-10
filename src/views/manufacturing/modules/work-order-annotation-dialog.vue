<template>
  <ArtDialog ref="dialogRef" size="sm">
    <div class="work-order-annotation">
      <ArtEntitySummary
        class="work-order-annotation__context"
        icon="ri:sticky-note-add-line"
        eyebrow="WORK ORDER NOTE"
        :title="currentOrderNo"
        description="批注独立于工单状态维护，不会改变已确认的 BOM 与工艺路线执行基线。"
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
  import { useUserStore } from '@/store/modules/user'
  import { annotateWorkOrder, type MesWorkOrder } from '@mes/api'

  export interface WorkOrderAnnotationDialogOpenData {
    row: MesWorkOrder
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<WorkOrderAnnotationDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const currentOrderNo = ref('')
  const currentId = ref('')
  const model = reactive<{
    urgency: MesWorkOrder['urgency']
    specialRequirement: string
  }>({
    urgency: 'normal',
    specialRequirement: ''
  })
  const items = computed<FormItem[]>(() => [
    {
      key: 'urgency',
      label: '加急状态',
      type: 'select',
      span: 24,
      options: getDictMap.value.mesWorkOrderUrgency ?? [],
      help: '紧急程度会直接显示在工单列表，便于生产人员快速识别。'
    },
    {
      key: 'specialRequirement',
      label: '特别批注',
      type: 'textarea',
      span: 24,
      props: {
        rows: 5,
        maxlength: 1000,
        showWordLimit: true,
        placeholder: '填写需要生产现场重点关注的要求'
      }
    }
  ])
  const rules = {
    urgency: [{ required: true, message: '请选择加急状态', trigger: 'change' }]
  }

  const handleOpen = async (data: WorkOrderAnnotationDialogOpenData) => {
    await userStore.ensureDictLoaded('mesWorkOrderUrgency')
    currentId.value = data.row.id
    currentOrderNo.value = data.row.workOrderNo
    model.urgency = data.row.urgency
    model.specialRequirement = data.row.specialRequirement || ''
    await dialogRef.value?.handleOpen(data, {
      title: '工单批注',
      subtitle: data.row.materialNameSnapshot,
      confirmText: '保存批注',
      onOpen: () => formRef.value?.clearValidate(),
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          await annotateWorkOrder(
            currentId.value,
            model.urgency,
            model.specialRequirement.trim() || null
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

<style scoped lang="scss">
  .work-order-annotation__context {
    margin-bottom: 18px;
  }
</style>
