export type WorkOrderStatus = 'pending' | 'abnormal' | 'confirmed' | 'closed'
export type WorkOrderUrgency = 'normal' | 'urgent1' | 'urgent2' | 'urgent3'
export type OperationTaskStatus = 'unscheduled' | 'scheduled' | 'processing' | 'closed'
export type OperationSchedulingStatus = 'no_schedule' | 'pending' | 'scheduled' | 'closed'
export type OperationExecutionStatus = 'planned' | 'released' | 'started' | 'completed' | 'closed'

export interface MesReferenceOption {
  id: string
  code: string
  name: string
  specification?: string
  unit?: string
}

export interface MesMaterialOption extends MesReferenceOption {
  tenantId: string
  drawingNo?: string
  productionUnitId?: string
  productionUnitName?: string
  plannerId?: string
  plannerName?: string
  dispatcherId?: string
  dispatcherName?: string
  inboundWarehouseId?: string
  inboundWarehouseName?: string
}

export interface MesWorkOrderBomItemSnapshot {
  id: string
  componentMaterialId: string
  componentMaterialCode: string
  componentMaterialName: string
  componentSpecification: string
  sequenceNo: number
  quantity: number
  unitId: string
  positionNo: string | null
  operationName: string | null
  assignedRouteStepId: string | null
  assignedOperationCode: string | null
  assignedOperationName: string | null
  assignmentSource: 'configured' | 'first_operation' | 'unassigned'
}

export interface MesWorkOrderBomSnapshot {
  id: string
  bomCode: string
  version: string
  status: string
  items: MesWorkOrderBomItemSnapshot[]
}

export interface MesWorkOrderRouteStepSnapshot {
  id: string
  code: string
  name: string
  sort: number
  sequenceType: string
  workCenterId: string | null
  departmentId: string | null
  description: string
}

export interface MesWorkOrderRouteSnapshot {
  id?: string
  name?: string
  code?: string
  version?: string
  steps?: MesWorkOrderRouteStepSnapshot[]
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
  isInitialDocument: boolean
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
  drawingNoSnapshot: string
  unitSnapshot: string
  workOrderTypeNameSnapshot: string
  plannerId: string | null
  plannerNameSnapshot: string
  dispatcherId: string | null
  dispatcherNameSnapshot: string
  inboundWarehouseId: string | null
  inboundWarehouseNameSnapshot: string
  projectNameSnapshot: string | null
  bomSnapshot: MesWorkOrderBomSnapshot[]
  routeSnapshot: MesWorkOrderRouteSnapshot
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
  | 'isInitialDocument'
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
  taskNo: string
  workOrderId: string
  routeStepId: string | null
  sequenceNo: number
  sequenceType: string
  operationCode: string
  operationName: string
  controlCodeId: string | null
  controlCodeSnapshot: string
  controlCodeNameSnapshot: string
  plannedQuantity: number
  operationUnit: string
  scheduledQuantity: number
  pendingScheduleQuantity: number
  completedQuantity: number
  cumulativeCompletedQuantity: number
  qualifiedQuantity: number
  cumulativeQualifiedQuantity: number
  unqualifiedQuantity: number
  cumulativeUnqualifiedQuantity: number
  scrapQuantity: number
  cumulativeScrapQuantity: number
  pendingReworkQuantity: number
  pendingInspectionQuantity: number
  plannedStartDate: string | null
  plannedEndDate: string | null
  requiredCompletionDate: string | null
  departmentId: string | null
  workCenterId: string | null
  status: OperationTaskStatus
  schedulingStatus: OperationSchedulingStatus
  operationStatus: OperationExecutionStatus
  urgency: WorkOrderUrgency
  reportedGoodQuantity: number
  reportedBadQuantity: number
  processContent: string | null
  remark: string
  annotation: string
  barcodeValue: string
  qrCodeValue: string
  createTime: string
  closedAt: string | null
  deletedAt: string | null
  updateTime: string
  workOrder?: Pick<
    MesWorkOrder,
    | 'workOrderNo'
    | 'workOrderTypeNameSnapshot'
    | 'projectNameSnapshot'
    | 'constructionNo'
    | 'materialCodeSnapshot'
    | 'materialNameSnapshot'
    | 'specificationSnapshot'
    | 'unitSnapshot'
    | 'plannedStartDate'
    | 'plannedEndDate'
    | 'urgency'
    | 'source'
    | 'remark'
    | 'specialRequirement'
    | 'trackingNo'
    | 'followNo'
    | 'salesOrderNo'
    | 'customerCode'
  >
  department?: Pick<MesReferenceOption, 'code' | 'name'>
  workCenter?: Pick<MesReferenceOption, 'code' | 'name'>
}

export interface MesOperationTaskScheduleInput {
  id: string
  workCenterId: string
  plannedStartDate: string
  plannedEndDate: string
}

export interface MesListQuery {
  current: number
  size: number
  tenantId?: string | null
  keyword?: string
  status?: string | string[]
  schedulingStatus?: string | string[]
  operationStatus?: string | string[]
  includeDeleted?: boolean
  plannedDates?: [string, string]
  workCenterId?: string
}

export interface MesBatchFailure {
  id: string
  message: string
}

export interface MesBatchResult {
  successIds: string[]
  failures: MesBatchFailure[]
}

export interface MesMaterialOptionQuery {
  tenantId: string
  keyword?: string
  current: number
  size: number
}
