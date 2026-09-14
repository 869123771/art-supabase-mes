import { useSupabase } from '@/hooks'
import { normalizeNullableText } from '@/utils/form/normalize'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type {
  MesListQuery,
  MesBatchResult,
  MesMaterialOption,
  MesMaterialOptionQuery,
  MesOperationTask,
  MesOperationTaskScheduleInput,
  MesReferenceOption,
  MesReferences,
  MesWorkOrder,
  MesWorkOrderInput
} from './manufacturing.types'

export * from './manufacturing.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: true,
  errorMessage: '制造执行数据加载失败，请稍后重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  requireAffected: true,
  showMessage: true,
  message: '保存成功',
  errorMessage: '保存失败，请检查必填项、业务状态和当前权限'
}

export async function fetchWorkOrders(params: MesListQuery, options?: { signal?: AbortSignal }) {
  let query = supabase
    .from('mes_work_order')
    .select('*', { count: 'exact' })
    .order('update_time', { ascending: false })
    .range((params.current - 1) * params.size, params.current * params.size - 1)
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  const statuses = (Array.isArray(params.status) ? params.status : [params.status]).filter(
    (status): status is string => Boolean(status)
  )
  const includesDeleted = statuses.includes('__deleted')
  const allowedStatuses = new Set(['pending', 'abnormal', 'confirmed', 'closed'])
  const activeStatuses = statuses.filter((status) => allowedStatuses.has(status))
  if (includesDeleted && activeStatuses.length) {
    query = query.or(
      `deleted_at.not.is.null,and(deleted_at.is.null,status.in.(${activeStatuses.join(',')}))`
    )
  } else if (includesDeleted) {
    query = query.not('deleted_at', 'is', null)
  } else {
    if (!params.includeDeleted) query = query.is('deleted_at', null)
    if (activeStatuses.length) query = query.in('status', activeStatuses)
  }
  if (params.plannedDates?.[0]) query = query.gte('planned_end_date', params.plannedDates[0])
  if (params.plannedDates?.[1]) query = query.lte('planned_end_date', params.plannedDates[1])
  if (params.keyword?.trim()) {
    query = query.or(
      buildOrIlikeFilter(
        ['work_order_no', 'material_code_snapshot', 'material_name_snapshot', 'sales_order_no'],
        params.keyword.trim()
      )
    )
  }
  const { data, total } = await responseHandle<MesWorkOrder[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function saveWorkOrder(input: MesWorkOrderInput, id?: string) {
  const payload = keysToSnakeDeep(input)
  await responseHandle(
    () =>
      id
        ? supabase
            .from('mes_work_order')
            .update(payload, { count: 'exact' })
            .eq('id', id)
            .select('id')
        : supabase.from('mes_work_order').insert(payload, { count: 'exact' }).select('id'),
    writeOptions
  )
}

export async function importWorkOrders(rows: MesWorkOrderInput[]) {
  await responseHandle(
    () =>
      supabase
        .from('mes_work_order')
        .insert(keysToSnakeDeep(rows), { count: 'exact' })
        .select('id'),
    { ...writeOptions, message: `已导入 ${rows.length} 条工单` }
  )
}

export async function transitionWorkOrder(id: string, action: string) {
  const { data } = await responseHandle<{ status?: string; message?: string }>(
    () => supabase.rpc('mes_transition_work_order', { p_id: id, p_action: action }),
    { ...writeOptions, requireAffected: false, message: '工单状态已更新' }
  )
  return data
}

export async function batchTransitionWorkOrders(ids: string[], action: string) {
  const { data } = await responseHandle<MesBatchResult>(
    () => supabase.rpc('mes_batch_transition_work_orders', { p_ids: ids, p_action: action }),
    {
      ...writeOptions,
      requireAffected: false,
      showMessage: false,
      message: ''
    }
  )
  return data ?? { successIds: [], failures: [] }
}

export async function copyWorkOrders(ids: string[]) {
  const { data } = await responseHandle<MesBatchResult>(
    () => supabase.rpc('mes_copy_work_orders', { p_ids: ids }),
    {
      ...writeOptions,
      requireAffected: false,
      showMessage: false,
      message: ''
    }
  )
  return data ?? { successIds: [], failures: [] }
}

export async function updateWorkOrderDueDates(ids: string[], plannedEndDate: string) {
  const { data } = await responseHandle<MesBatchResult>(
    () =>
      supabase.rpc('mes_batch_update_due_date', {
        p_ids: ids,
        p_planned_end_date: plannedEndDate
      }),
    {
      ...writeOptions,
      requireAffected: false,
      showMessage: false,
      message: ''
    }
  )
  return data ?? { successIds: [], failures: [] }
}

export async function annotateWorkOrder(
  id: string,
  urgency: MesWorkOrder['urgency'],
  specialRequirement: string | null
) {
  const { data } = await responseHandle<{
    id: string
    urgency: MesWorkOrder['urgency']
    specialRequirement: string | null
  }>(
    () =>
      supabase.rpc('mes_annotate_work_order', {
        p_id: id,
        p_urgency: urgency,
        p_special_requirement: specialRequirement
      }),
    { ...writeOptions, requireAffected: false, message: '工单批注已更新' }
  )
  return data
}

export async function fetchOperationTasks(
  params: MesListQuery,
  options?: { signal?: AbortSignal }
) {
  let query = supabase
    .from('mes_operation_task')
    .select(
      '*,workOrder:mes_work_order!mes_operation_task_order_fk(work_order_no,material_code_snapshot,material_name_snapshot,planned_start_date,planned_end_date,urgency)',
      { count: 'exact' }
    )
    .order('update_time', { ascending: false })
    .range((params.current - 1) * params.size, params.current * params.size - 1)
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (!params.includeDeleted) query = query.is('deleted_at', null)
  if (params.status) query = query.eq('status', params.status)
  if (params.workCenterId) query = query.eq('work_center_id', params.workCenterId)
  if (params.plannedDates?.[0]) query = query.gte('planned_end_date', params.plannedDates[0])
  if (params.plannedDates?.[1]) query = query.lte('planned_start_date', params.plannedDates[1])
  if (params.keyword?.trim()) {
    query = query.or(
      buildOrIlikeFilter(
        ['operation_code', 'operation_name', 'process_content'],
        params.keyword.trim()
      )
    )
  }
  const { data, total } = await responseHandle<MesOperationTask[]>(
    () => (options?.signal ? query.abortSignal(options.signal) : query),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function scheduleOperationTask(input: MesOperationTaskScheduleInput) {
  const { data } = await responseHandle<{
    id: string
    status: string
    workCenterId: string
    plannedStartDate: string
    plannedEndDate: string
  }>(
    () =>
      supabase.rpc('mes_schedule_operation_task', {
        p_id: input.id,
        p_work_center_id: input.workCenterId,
        p_planned_start_date: input.plannedStartDate,
        p_planned_end_date: input.plannedEndDate
      }),
    { ...writeOptions, requireAffected: false, message: '排程已更新' }
  )
  return data
}

export async function transitionOperationTask(id: string, action: string, workCenterId?: string) {
  return responseHandle(
    () =>
      supabase.rpc('mes_transition_operation_task', {
        p_id: id,
        p_action: action,
        p_work_center_id: workCenterId || null
      }),
    { ...writeOptions, requireAffected: false, message: '工序任务状态已更新' }
  )
}

export async function fetchMesReferences(tenantId?: string): Promise<MesReferences> {
  let customerQuery = supabase
    .from('mdm_customer')
    .select('id,code:customer_code,name:customer_name')
    .eq('enabled', true)
    .order('customer_name')
  if (tenantId) customerQuery = customerQuery.eq('tenant_id', tenantId)

  const [referenceResult, customerResult] = await Promise.all([
    responseHandle<Omit<MesReferences, 'customers'>>(
      () => supabase.rpc('mes_work_order_references', { p_tenant_id: tenantId || null }),
      { ...readOptions, showErrorMessage: false }
    ),
    responseHandle<MesReferenceOption[]>(() => customerQuery, {
      ...readOptions,
      showErrorMessage: false
    })
  ])
  return {
    materials: referenceResult.data?.materials ?? [],
    customers: customerResult.data ?? [],
    projects: referenceResult.data?.projects ?? [],
    documentTypes: referenceResult.data?.documentTypes ?? [],
    employees: referenceResult.data?.employees ?? [],
    workCenters: referenceResult.data?.workCenters ?? []
  }
}

export async function fetchMesMaterialOptions(
  params: MesMaterialOptionQuery
): Promise<{ data: MesMaterialOption[]; total: number }> {
  const { data } = await responseHandle<{ data?: MesMaterialOption[]; total?: number }>(
    () =>
      supabase.rpc('mes_work_order_material_options', {
        p_tenant_id: params.tenantId,
        p_keyword: normalizeNullableText(params.keyword),
        p_page: params.current,
        p_page_size: params.size
      }),
    { ...readOptions, showErrorMessage: false }
  )
  return { data: data?.data ?? [], total: data?.total ?? 0 }
}
