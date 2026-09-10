<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="work-order-dialog">
      <ArtEntitySummary
        class="work-order-dialog__context"
        icon="ri:file-list-3-line"
        eyebrow="MANUFACTURING EXECUTION"
        :title="heading"
        description="确认前维护计划信息；确认后将固化物料、BOM 与工艺路线，形成可追溯的执行基线。"
      />
      <WorkOrderDetail
        v-if="readonly && detailRecord"
        :record="detailRecord"
        :references="references"
        :tenant-options="tenantOptions"
      />
      <ArtForm
        v-else
        ref="formRef"
        v-model="model"
        :items="formItems"
        :rules="rules"
        :span="12"
        :gutter="24"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #merchandiserId
          ><ArtEmployeeSelect
            :model-value="model.merchandiserId ?? undefined"
            :selected-data="employeeSelection(model.merchandiserId)"
            :tenant-id="model.tenantId"
            placeholder="选择跟单员"
            @update:model-value="model.merchandiserId = $event ?? null"
        /></template>
        <template #salespersonId
          ><ArtEmployeeSelect
            :model-value="model.salespersonId ?? undefined"
            :selected-data="employeeSelection(model.salespersonId)"
            :tenant-id="model.tenantId"
            placeholder="选择业务员"
            @update:model-value="model.salespersonId = $event ?? null"
        /></template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import WorkOrderDetail from './work-order-detail.vue'
  import {
    fetchMesReferences,
    saveWorkOrder,
    type MesReferences,
    type MesWorkOrder,
    type MesWorkOrderInput
  } from '@mes/api'

  export interface WorkOrderDialogOpenData {
    tenantId: string
    tenantOptions: Array<{ label: string; value: string }>
    row?: MesWorkOrder
    readonly?: boolean
  }

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const dialogRef = ref<ArtDialogExpose<WorkOrderDialogOpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const references = ref<MesReferences>({
    materials: [],
    customers: [],
    projects: [],
    documentTypes: [],
    employees: [],
    workCenters: []
  })
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const readonly = ref(false)
  const detailRecord = ref<MesWorkOrder>()
  const model = reactive<MesWorkOrderInput>({
    tenantId: '',
    workOrderNo: '',
    workOrderTypeId: null,
    projectId: null,
    constructionNo: null,
    materialId: '',
    orderQuantity: 1,
    plannedStartDate: null,
    plannedEndDate: '',
    source: 'manual',
    urgency: 'normal',
    remark: '',
    specialRequirement: null,
    trackingNo: null,
    followNo: null,
    merchandiserId: null,
    salespersonId: null,
    customerCode: null,
    customProcessCode: null,
    specificationQuantity: null,
    salesOrderNo: null,
    salesOrderQuantity: null
  })
  const currentId = ref('')
  const heading = computed(() =>
    readonly.value ? '工单详情' : currentId.value ? '编辑工单' : '新增工单'
  )
  const option = (items: Array<{ id: string; code: string; name: string }>) =>
    items.map((item) => ({ label: `${item.name} · ${item.code}`, value: item.id }))
  const locked = computed(() => readonly.value)
  const dictionaryOptions = (code: string) => getDictMap.value[code] ?? []
  const employeeSelection = (id?: string | null): EmployeeIntegrationItem[] => {
    const item = references.value.employees.find((employee) => employee.id === id)
    return item
      ? [
          {
            id: item.id,
            tenantId: model.tenantId,
            employeeNo: item.code,
            employeeName: item.name,
            employmentStatus: 'active'
          }
        ]
      : []
  }
  const formItems = computed<FormItem[]>(() => [
    { key: 'identity', label: '工单识别', type: 'divider', span: 24 },
    {
      key: 'tenantId',
      label: '所属租户',
      type: 'select',
      span: 24,
      options: tenantOptions.value,
      props: {
        disabled: locked.value || !!currentId.value,
        filterable: true,
        onChange: loadReferences
      },
      help: '全部租户视图下新增时，必须明确数据归属。'
    },
    {
      key: 'workOrderNo',
      label: '工单编号',
      props: { disabled: locked.value, placeholder: '留空后按月自动生成' }
    },
    {
      key: 'workOrderTypeId',
      label: '工单类型',
      type: 'select',
      options: option(references.value.documentTypes),
      props: { disabled: locked.value, clearable: true, filterable: true }
    },
    {
      key: 'projectId',
      label: '项目',
      type: 'select',
      options: option(references.value.projects),
      props: { disabled: locked.value, clearable: true, filterable: true }
    },
    { key: 'constructionNo', label: '施工编号', props: { disabled: locked.value } },
    { key: 'plan', label: '产品与计划', type: 'divider', span: 24 },
    {
      key: 'materialId',
      label: '产品物料',
      type: 'select',
      options: option(references.value.materials),
      props: { disabled: locked.value, filterable: true }
    },
    {
      key: 'orderQuantity',
      label: '工单数量',
      type: 'number',
      props: { disabled: locked.value, min: 0.000001, precision: 6, class: '!w-full' }
    },
    {
      key: 'plannedStartDate',
      label: '计划开始',
      type: 'date',
      props: { disabled: locked.value, valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    {
      key: 'plannedEndDate',
      label: '计划结束',
      type: 'date',
      props: { disabled: locked.value, valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    {
      key: 'source',
      label: '工单来源',
      type: 'select',
      options: dictionaryOptions('mesWorkOrderSource'),
      props: { disabled: locked.value }
    },
    {
      key: 'urgency',
      label: '紧急程度',
      type: 'select',
      options: dictionaryOptions('mesWorkOrderUrgency'),
      props: { disabled: locked.value }
    },
    { key: 'sales', label: '销售协同', type: 'divider', span: 24 },
    {
      key: 'customerCode',
      label: '客户',
      type: 'select',
      options: references.value.customers.map((item) => ({
        label: `${item.name} · ${item.code}`,
        value: item.code
      })),
      props: {
        disabled: locked.value,
        clearable: true,
        filterable: true,
        placeholder: '请选择客户'
      }
    },
    { key: 'salesOrderNo', label: '销售订单号', props: { disabled: locked.value } },
    {
      key: 'salesOrderQuantity',
      label: '销售数量',
      type: 'number',
      props: { disabled: locked.value, min: 0, precision: 6, class: '!w-full' }
    },
    { key: 'merchandiserId', label: '跟单员', type: 'slot' },
    { key: 'salespersonId', label: '业务员', type: 'slot' },
    { key: 'trackingNo', label: '跟踪号', props: { disabled: locked.value } },
    { key: 'followNo', label: '跟随号', props: { disabled: locked.value } },
    { key: 'customProcessCode', label: '定制工艺编号', props: { disabled: locked.value } },
    {
      key: 'specificationQuantity',
      label: '规格数量',
      type: 'number',
      props: { disabled: locked.value, min: 0, precision: 6, class: '!w-full' }
    },
    {
      key: 'specialRequirement',
      label: '特殊要求',
      type: 'textarea',
      span: 24,
      props: { disabled: locked.value, rows: 3, maxlength: 1000, showWordLimit: true }
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      span: 24,
      props: { disabled: locked.value, rows: 3, maxlength: 1000, showWordLimit: true }
    }
  ])
  const rules = {
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    materialId: [{ required: true, message: '请选择产品物料', trigger: 'change' }],
    orderQuantity: [{ required: true, message: '请输入工单数量', trigger: 'blur' }],
    plannedEndDate: [{ required: true, message: '请选择计划结束日期', trigger: 'change' }]
  }

  async function loadReferences() {
    references.value = await fetchMesReferences(model.tenantId)
  }
  const handleOpen = async (data: WorkOrderDialogOpenData) => {
    tenantOptions.value = data.tenantOptions
    detailRecord.value = data.row
    readonly.value =
      !!data.readonly || !!(data.row && !['pending', 'abnormal'].includes(data.row.status))
    currentId.value = data.row?.id || ''
    Object.assign(
      model,
      data.row
        ? cloneDeep(data.row)
        : {
            tenantId: data.tenantId,
            workOrderNo: '',
            workOrderTypeId: null,
            projectId: null,
            constructionNo: null,
            materialId: '',
            orderQuantity: 1,
            plannedStartDate: null,
            plannedEndDate: '',
            source: 'manual',
            urgency: 'normal',
            remark: '',
            specialRequirement: null,
            trackingNo: null,
            followNo: null,
            merchandiserId: null,
            salespersonId: null,
            customerCode: null,
            customProcessCode: null,
            specificationQuantity: null,
            salesOrderNo: null,
            salesOrderQuantity: null
          }
    )
    await Promise.all(
      ['mesWorkOrderSource', 'mesWorkOrderUrgency', 'mesWorkOrderStatus'].map((code) =>
        userStore.ensureDictLoaded(code)
      )
    )
    await dialogRef.value?.handleOpen(data, {
      title: heading.value,
      subtitle: data.row?.workOrderNo || '计划工单',
      showFooter: !readonly.value,
      confirmText: currentId.value ? '保存更改' : '创建工单',
      contentMaxHeight: '72vh',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          await loadReferences()
          formRef.value?.clearValidate()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          const payload = { ...model }
          await saveWorkOrder(payload, currentId.value || undefined)
          emit('success', currentId.value ? 'edit' : 'add')
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
  .work-order-dialog__context {
    margin-bottom: 18px;
  }
</style>
