<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="work-order-dialog">
      <ArtEntitySummary
        class="work-order-dialog__context"
        icon="ri:file-list-3-line"
        eyebrow="MANUFACTURING EXECUTION"
        :title="heading"
        description="确认前维护计划信息；保存后即集成物料、BOM 与工艺路线，形成可追溯的执行基线。"
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
        <template #materialId>
          <ArtTableSingleSelect
            :model-value="model.materialId || undefined"
            :selected-data="selectedMaterial ? [selectedMaterial] : []"
            :api-fn="fetchMaterialOptions"
            :columns="materialColumns"
            :label-key="materialDescription"
            description-key="code"
            title="选择物料描述"
            subtitle="支持物料编码、名称、规格型号和图号综合查询"
            placeholder="请选择物料描述"
            search-placeholder="搜索物料编码、名称、规格型号或图号"
            show-pagination
            :disabled="locked"
            @change="handleMaterialChange"
          />
        </template>
        <template #urgency>
          <WorkOrderUrgencySegmented v-model="model.urgency" :disabled="locked" />
        </template>
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
  import dayjs from 'dayjs'
  import { cloneDeep, pick } from 'lodash-es'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type {
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import WorkOrderDetail from './work-order-detail.vue'
  import WorkOrderUrgencySegmented from './work-order-urgency-segmented.vue'
  import {
    calculatePlanFromEnd,
    calculatePlanFromStart,
    calculateProductionDays
  } from './work-order-plan'
  import {
    fetchMesMaterialOptions,
    fetchMesReferences,
    saveWorkOrder,
    type MesMaterialOption,
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

  interface WorkOrderFormModel extends MesWorkOrderInput {
    materialCode: string
    specificationModel: string
    drawingNo: string
    productionUnitName: string
    plannerName: string
    dispatcherName: string
    inboundWarehouseName: string
    productionFixedLeadDays: number
    productionPreprocessDays: number
    selfMadeProductionDays: number
    productionPostprocessDays: number
    productionDays: number
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
  const model = reactive<WorkOrderFormModel>({
    tenantId: '',
    workOrderNo: '',
    workOrderTypeId: null,
    projectId: null,
    constructionNo: null,
    materialId: '',
    materialCode: '',
    specificationModel: '',
    drawingNo: '',
    productionUnitName: '',
    plannerName: '',
    dispatcherName: '',
    inboundWarehouseName: '',
    productionFixedLeadDays: 0,
    productionPreprocessDays: 0,
    selfMadeProductionDays: 0,
    productionPostprocessDays: 0,
    productionDays: 0,
    orderQuantity: 1,
    isInitialDocument: false,
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
  const selectedMaterial = shallowRef<MesMaterialOption>()
  const currentId = ref('')
  const heading = computed(() =>
    readonly.value ? '工单详情' : currentId.value ? '编辑工单' : '新增工单'
  )
  const option = (items: Array<{ id: string; code: string; name: string }>) =>
    items.map((item) => ({ label: `${item.name} · ${item.code}`, value: item.id }))
  const locked = computed(() => readonly.value)
  const dictionaryOptions = (code: string) => getDictMap.value[code] ?? []
  const materialDescription = (row: DataSelectRecord): string => {
    const material = row as MesMaterialOption
    return [material.name, material.specification, material.drawingNo].filter(Boolean).join(' · ')
  }
  const materialColumns = [
    { prop: 'code', label: '物料编码', minWidth: 150 },
    { prop: 'name', label: '物料描述', minWidth: 180 },
    { prop: 'specification', label: '规格型号', minWidth: 140 },
    { prop: 'drawingNo', label: '图号', minWidth: 120 },
    { prop: 'productionUnitName', label: '生产单位', minWidth: 110 },
    { prop: 'plannerName', label: '计划员', minWidth: 110 },
    { prop: 'dispatcherName', label: '调度员', minWidth: 110 },
    { prop: 'inboundWarehouseName', label: '入库仓库', minWidth: 130 },
    { prop: 'productionDays', label: '生产天数', width: 100, align: 'right' as const }
  ]
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
        onChange: handleTenantChange
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
      label: '物料描述',
      type: 'slot',
      span: 24
    },
    { key: 'materialCode', label: '物料编码', type: 'text', span: 8 },
    { key: 'specificationModel', label: '规格型号', type: 'text', span: 8 },
    { key: 'drawingNo', label: '图号', type: 'text', span: 8 },
    { key: 'productionUnitName', label: '生产单位', type: 'text', span: 8 },
    { key: 'plannerName', label: '计划员', type: 'text', span: 8 },
    { key: 'dispatcherName', label: '调度员', type: 'text', span: 8 },
    { key: 'inboundWarehouseName', label: '入库仓库', type: 'text', span: 8 },
    {
      key: 'orderQuantity',
      label: '工单数量',
      type: 'number',
      props: { disabled: locked.value, min: 0.000001, precision: 6, class: '!w-full' }
    },
    {
      key: 'productionDays',
      label: '生产天数',
      type: 'number',
      props: { disabled: true, min: 0, precision: 0, class: '!w-full' },
      help: `固定 ${model.productionFixedLeadDays} 天 + 前处理 ${model.productionPreprocessDays} 天 + 自制 ${model.selfMadeProductionDays} 天 + 后处理 ${model.productionPostprocessDays} 天`
    },
    {
      key: 'plannedStartDate',
      label: '计划开始日期',
      type: 'date',
      props: {
        disabled: locked.value,
        valueFormat: 'YYYY-MM-DD',
        class: '!w-full',
        onChange: handlePlannedStartChange
      },
      help: '修改后按生产天数自动推算计划完工日期。'
    },
    {
      key: 'plannedEndDate',
      label: '计划完工日期',
      type: 'date',
      props: {
        disabled: locked.value,
        valueFormat: 'YYYY-MM-DD',
        class: '!w-full',
        onChange: handlePlannedEndChange
      },
      help: '修改后反推计划开始日期；若反推日期已过期，则从今天重新计算。'
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
      type: 'slot',
      span: 24
    },
    {
      key: 'isInitialDocument',
      label: '初始化单据',
      type: 'switch',
      span: 24,
      props: { disabled: locked.value, activeText: '是', inactiveText: '否' },
      help: '默认关闭；开启后用于标识初始化导入或期初生产单据。'
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
    materialId: [{ required: true, message: '请选择物料描述', trigger: 'change' }],
    orderQuantity: [{ required: true, message: '请输入工单数量', trigger: 'blur' }],
    plannedStartDate: [{ required: true, message: '请选择计划开始日期', trigger: 'change' }],
    plannedEndDate: [{ required: true, message: '请选择计划完工日期', trigger: 'change' }]
  }

  async function loadReferences() {
    references.value = await fetchMesReferences(model.tenantId)
  }
  async function handleTenantChange(): Promise<void> {
    applyMaterial()
    await loadReferences()
  }
  async function fetchMaterialOptions(params: DataSelectFetchParams) {
    if (!model.tenantId) return { data: [], total: 0 }
    return fetchMesMaterialOptions({
      tenantId: model.tenantId,
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
  }
  function applyPlanFromStart(value: string): void {
    const plan = calculatePlanFromStart(value, model.productionDays)
    if (plan) Object.assign(model, plan)
  }
  function applyPlanFromEnd(value: string): void {
    const plan = calculatePlanFromEnd(value, model.productionDays)
    if (plan) Object.assign(model, plan)
  }
  function handlePlannedStartChange(value: unknown): void {
    if (typeof value === 'string') applyPlanFromStart(value)
  }
  function handlePlannedEndChange(value: unknown): void {
    if (typeof value === 'string') applyPlanFromEnd(value)
  }
  function applyMaterial(material?: MesMaterialOption, recalculatePlan = true): void {
    const productionFixedLeadDays = material?.productionFixedLeadDays ?? 0
    const productionPreprocessDays = material?.productionPreprocessDays ?? 0
    const selfMadeProductionDays = material?.selfMadeProductionDays ?? 0
    const productionPostprocessDays = material?.productionPostprocessDays ?? 0
    const productionDays =
      material?.productionDays ??
      calculateProductionDays({
        productionFixedLeadDays,
        productionPreprocessDays,
        selfMadeProductionDays,
        productionPostprocessDays
      })
    selectedMaterial.value = material
    Object.assign(model, {
      materialId: material?.id || '',
      materialCode: material?.code || '',
      specificationModel: material?.specification || '',
      drawingNo: material?.drawingNo || '',
      productionUnitName: material?.productionUnitName || material?.unit || '',
      plannerName: material?.plannerName || '',
      dispatcherName: material?.dispatcherName || '',
      inboundWarehouseName: material?.inboundWarehouseName || '',
      productionFixedLeadDays,
      productionPreprocessDays,
      selfMadeProductionDays,
      productionPostprocessDays,
      productionDays
    })
    if (!material || !recalculatePlan) return
    if (model.plannedStartDate) applyPlanFromStart(model.plannedStartDate)
    else if (model.plannedEndDate) applyPlanFromEnd(model.plannedEndDate)
    else applyPlanFromStart(dayjs().format('YYYY-MM-DD'))
  }
  function handleMaterialChange(_value: unknown, rows: DataSelectRecord[]): void {
    applyMaterial(rows[0] as MesMaterialOption | undefined)
  }
  const workOrderInputKeys = [
    'tenantId',
    'workOrderNo',
    'workOrderTypeId',
    'projectId',
    'constructionNo',
    'materialId',
    'orderQuantity',
    'isInitialDocument',
    'plannedStartDate',
    'plannedEndDate',
    'source',
    'urgency',
    'remark',
    'specialRequirement',
    'trackingNo',
    'followNo',
    'merchandiserId',
    'salespersonId',
    'customerCode',
    'customProcessCode',
    'specificationQuantity',
    'salesOrderNo',
    'salesOrderQuantity'
  ] as const satisfies readonly (keyof MesWorkOrderInput)[]
  function buildPayload(): MesWorkOrderInput {
    const payload = pick(model, workOrderInputKeys)
    return {
      ...payload,
      workOrderNo: payload.workOrderNo.trim(),
      constructionNo: normalizeNullableText(payload.constructionNo),
      remark: payload.remark.trim(),
      specialRequirement: normalizeNullableText(payload.specialRequirement),
      trackingNo: normalizeNullableText(payload.trackingNo),
      followNo: normalizeNullableText(payload.followNo),
      customerCode: normalizeNullableText(payload.customerCode),
      customProcessCode: normalizeNullableText(payload.customProcessCode),
      salesOrderNo: normalizeNullableText(payload.salesOrderNo)
    }
  }
  const handleOpen = async (data: WorkOrderDialogOpenData) => {
    tenantOptions.value = data.tenantOptions
    detailRecord.value = data.row
    readonly.value =
      !!data.readonly || !!(data.row && !['pending', 'abnormal'].includes(data.row.status))
    currentId.value = data.row?.id || ''
    selectedMaterial.value = data.row
      ? {
          id: data.row.materialId,
          tenantId: data.row.tenantId,
          code: data.row.materialCodeSnapshot,
          name: data.row.materialNameSnapshot,
          specification: data.row.specificationSnapshot,
          drawingNo: data.row.drawingNoSnapshot,
          unit: data.row.unitSnapshot,
          productionUnitId: data.row.productionUnitId || undefined,
          productionUnitName: data.row.unitSnapshot,
          plannerId: data.row.plannerId || undefined,
          plannerName: data.row.plannerNameSnapshot,
          dispatcherId: data.row.dispatcherId || undefined,
          dispatcherName: data.row.dispatcherNameSnapshot,
          inboundWarehouseId: data.row.inboundWarehouseId || undefined,
          inboundWarehouseName: data.row.inboundWarehouseNameSnapshot,
          productionFixedLeadDays: data.row.productionFixedLeadDaysSnapshot,
          productionPreprocessDays: data.row.productionPreprocessDaysSnapshot,
          selfMadeProductionDays: data.row.selfMadeProductionDaysSnapshot,
          productionPostprocessDays: data.row.productionPostprocessDaysSnapshot,
          productionDays: data.row.productionDaysSnapshot
        }
      : undefined
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
            materialCode: '',
            specificationModel: '',
            drawingNo: '',
            productionUnitName: '',
            plannerName: '',
            dispatcherName: '',
            inboundWarehouseName: '',
            productionFixedLeadDays: 0,
            productionPreprocessDays: 0,
            selfMadeProductionDays: 0,
            productionPostprocessDays: 0,
            productionDays: 0,
            orderQuantity: 1,
            isInitialDocument: false,
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
    if (selectedMaterial.value) applyMaterial(selectedMaterial.value, false)
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
          const payload = buildPayload()
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
