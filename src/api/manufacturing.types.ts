export type WorkOrderStatus = 'pending' | 'abnormal' | 'confirmed' | 'closed'
export type WorkOrderUrgency = 'normal' | 'urgent1' | 'urgent2' | 'urgent3'
export type OperationTaskStatus = 'unscheduled' | 'scheduled' | 'processing' | 'closed'

export interface MesReferenceOption {
  id: string
  code: string
  name: string
  specification?: string
  unit?: string
}

export interface MesReferences {
  materials: MesReferenceOption[]
  customers: MesReferenceOption[]
  projects: MesReferenceOption[]
  documentTypes: MesReferenceOption[]
  employees: MesReferenceOption[]
  workCenters: MesReferenceOption[]
}

export interface MesWorkOrder {
  id: string
  tenantId: string
  workOrderNo: string
  workOrderTypeId: string | null
  projectId: string | null
  constructionNo: string | null
  materialId: string
  orderQuantity: number
  productionUnitId: string | null
  plannedStartDate: string | null
  plannedEndDate: string
  source: string
  urgency: WorkOrderUrgency
  status: WorkOrderStatus
  statusReason: string | null
  remark: string
  specialRequirement: string | null
  trackingNo: string | null
  followNo: string | null
  merchandiserId: string | null
  salespersonId: string | null
  customerCode: string | null
  customProcessCode: string | null
  specificationQuantity: number | null
  salesOrderNo: string | null
  salesOrderQuantity: number | null
  completedQuantity: number
  warehousedQuantity: number
  printCount: number
  materialCodeSnapshot: string
  materialNameSnapshot: string
  specificationSnapshot: string
  unitSnapshot: string
  projectNameSnapshot: string | null
  confirmedAt: string | null
  closedAt: string | null
  deletedAt: string | null
  updateTime: string
}

export type MesWorkOrderInput = Pick<
  MesWorkOrder,
  | 'tenantId'
  | 'workOrderNo'
  | 'workOrderTypeId'
  | 'projectId'
  | 'constructionNo'
  | 'materialId'
  | 'orderQuantity'
  | 'plannedStartDate'
  | 'plannedEndDate'
  | 'source'
  | 'urgency'
  | 'remark'
  | 'specialRequirement'
  | 'trackingNo'
  | 'followNo'
  | 'merchandiserId'
  | 'salespersonId'
  | 'customerCode'
  | 'customProcessCode'
  | 'specificationQuantity'
  | 'salesOrderNo'
  | 'salesOrderQuantity'
>

export interface MesOperationTask {
  id: string
  tenantId: string
  workOrderId: string
  sequenceNo: number
  sequenceType: string
  operationCode: string
  operationName: string
  plannedQuantity: number
  plannedStartDate: string | null
  plannedEndDate: string | null
  departmentId: string | null
  workCenterId: string | null
  status: OperationTaskStatus
  reportedGoodQuantity: number
  reportedBadQuantity: number
  processContent: string | null
  remark: string
  closedAt: string | null
  deletedAt: string | null
  updateTime: string
  workOrder?: Pick<MesWorkOrder, 'workOrderNo' | 'materialCodeSnapshot' | 'materialNameSnapshot'>
}

export interface MesListQuery {
  current: number
  size: number
  tenantId?: string | null
  keyword?: string
  status?: string
  includeDeleted?: boolean
  plannedDates?: [string, string]
  workCenterId?: string
}
