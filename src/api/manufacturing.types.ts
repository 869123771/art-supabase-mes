export type WorkOrderStatus = 'pending' | 'abnormal' | 'confirmed' | 'closed'
export type WorkOrderUrgency = 'normal' | 'urgent1' | 'urgent2' | 'urgent3'
export type OperationTaskStatus = 'unscheduled' | 'scheduled' | 'processing' | 'closed'
export type OperationSchedulingStatus = 'no_schedule' | 'pending' | 'scheduled' | 'closed'
export type OperationExecutionStatus = 'planned' | 'released' | 'started' | 'completed' | 'closed'
export type SchedulingDirection = 'forward' | 'backward'
export type SchedulingDispatchRule = 'priority' | 'edd' | 'fifo' | 'spt'

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
  productionFixedLeadDays?: number
  productionPreprocessDays?: number
  selfMadeProductionDays?: number
  productionPostprocessDays?: number
  productionDays?: number
  schedulingPriority?: number
  schedulingStrategy?: 'inherit' | SchedulingDirection
  planningTimeFenceDays?: number
  batchRoundingQuantity?: number
}

export interface MesWorkOrderBomItemSnapshot {
  id: string
  componentMaterialId: string
  componentMaterialCode: string
  componentMaterialName: string
  componentSpecification: string
  sequenceNo: number
  quantity: number
  basicQuantity: number
  requiredQuantity: number
  unitId: string
  unitName: string
  positionNo: string | null
  operationName: string | null
  assignedRouteStepId: string | null
  assignedOperationCode: string | null
  assignedOperationName: string | null
  assignmentSource: 'configured' | 'first_operation' | 'unassigned'
  sourcePath: string[]
  virtualUnexpanded: boolean
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
  sequenceNo: number
  sequenceType: string
  workCenterId: string | null
  workCenterIds: string[]
  workCenterNames: string[]
  departmentId: string | null
  departmentName: string
  unitId: string | null
  unitName: string
  basicBatch: number
  runOutputQuantity: number
  runProcessingMinutes: number
  runGreenMinutes: number | null
  setupMinutes: number
  operatorCount: number
  machineCount: number
  operationMode: string
  processingMode: string
  reportMode: string
  inspectionMode: string
  sequenceControl: string
  reworkMode: string
  firstInspectionControl: string
  needInspection: boolean
  firstInspection: boolean
  isFirst: boolean
  isLast: boolean
  critical: boolean
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
  productionFixedLeadDaysSnapshot: number
  productionPreprocessDaysSnapshot: number
  selfMadeProductionDaysSnapshot: number
  productionPostprocessDaysSnapshot: number
  productionDaysSnapshot: number
  schedulingRuleId: string | null
  schedulingPriority: number
  schedulingStrategySnapshot: SchedulingDirection
  planningTimeFenceDaysSnapshot: number
  batchRoundingQuantitySnapshot: number | null
  scheduleLocked: boolean
  lastScheduledAt: string | null
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
  requiredStartDate: string | null
  departmentId: string | null
  workCenterId: string | null
  eligibleWorkCenterIds: string[]
  setupMinutes: number
  processingMinutes: number
  queueMinutes: number
  transferMinutes: number
  estimatedWorkMinutes: number
  minimumTransferQuantity: number
  overlapEnabled: boolean
  scheduleLocked: boolean
  scheduleSource: 'manual' | 'rule'
  schedulingRuleId: string | null
  scheduledAt: string | null
  scheduleVersion: number
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

export interface MesSchedulingRule {
  id: string
  tenantId: string
  code: string
  name: string
  enabled: boolean
  isDefault: boolean
  direction: SchedulingDirection
  dispatchingRule: SchedulingDispatchRule
  finiteCapacity: boolean
  respectCalendar: boolean
  includeSetupTime: boolean
  includeQueueTime: boolean
  includeTransferTime: boolean
  preserveLockedTasks: boolean
  allowOvertime: boolean
  frozenHorizonDays: number
  planningHorizonDays: number
  priorityWeight: number
  dueDateWeight: number
  criticalOperationWeight: number
  resourceSelectionStrategy: 'earliest_available' | 'least_load' | 'preferred'
  conflictStrategy: 'reject' | 'warn' | 'allow'
  remark: string
  createTime: string
  updateTime: string
}

export type MesSchedulingRuleInput = Omit<MesSchedulingRule, 'id' | 'createTime' | 'updateTime'>

export interface MesAutoScheduleProposal {
  taskId: string
  taskNo: string
  operationName: string
  sequenceNo: number
  workCenterId: string
  workCenterCode: string
  workCenterName: string
  plannedStartDate: string
  plannedEndDate: string
  estimatedMinutes: number
  capacityMinutesPerDay: number
  durationDays: number
}

export interface MesAutoScheduleResult {
  workOrderId: string
  ruleId: string
  ruleName: string
  applied: boolean
  scheduledCount: number
  skippedCount: number
  proposals: MesAutoScheduleProposal[]
  warnings: string[]
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
