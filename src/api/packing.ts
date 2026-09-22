import { useSupabase } from '@/hooks'
import { fetchAllRangePages } from '@/utils/supabase/pagination'

export type BoardKind = 'PU_BOARD' | 'ROCK_BOARD'
export type RemainderPolicy = 'separate' | 'merge' | 'manual'
export type PackingStatus = 'unpacked' | 'partial' | 'packed'

export interface PackRule {
  id: string
  tenantId: string
  ruleCode: BoardKind
  ruleName: string
  enabled: boolean
  maxPieces: number
  maxStackHeight: number
  maxWeight: number | null
  maxLength: number | null
  sameWidth: boolean
  sameArea: boolean
  allowMixLength: boolean
  remainderPolicy: RemainderPolicy
  sortPriority: string
  remark: string
  updateTime: string
}

export type PackRuleInput = Omit<PackRule, 'id' | 'updateTime'>

export interface WorkOrderBoard {
  id: string
  tenantId: string
  workOrderId: string
  area: string
  axis: string
  boardNo: string
  lengthMm: number
  widthMm: number
  areaSqm: number
  thicknessMm: number
  unitWeightKg: number | null
  pieces: number
  packedPieces: number
  remark: string
}

export interface WorkOrderPackItem {
  id: string
  boardId: string
  pieces: number
  remark: string
}

export interface WorkOrderPack {
  id: string
  packNo: string
  area: string
  axis: string
  manuallyAdjusted: boolean
  confirmed: boolean
  remark: string
  items: WorkOrderPackItem[]
}

export interface PackDraft {
  id?: string
  packNo: string
  manuallyAdjusted: boolean
  confirmed: boolean
  remark: string
  items: Array<{ boardId: string; pieces: number; remark: string }>
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: true,
  errorMessage: '排包数据加载失败，请重试'
}

export async function fetchPackRules(tenantId?: string | null): Promise<PackRule[]> {
  let query = supabase.from('mes_pack_rule').select('*').order('rule_code')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<PackRule[]>(() => query, readOptions)
  return data ?? []
}

export async function savePackRule(input: PackRuleInput, id?: string): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('mes_save_pack_rule', { p_id: id || null, p_payload: keysToSnakeDeep(input) }),
    {
      breakReturn: true,
      showErrorMessage: true,
      requireAffected: false,
      errorMessage: '排包规则保存失败，请检查规则和权限'
    }
  )
}

export async function fetchPackingOrders(tenantId?: string | null): Promise<
  Array<{
    id: string
    tenantId: string
    workOrderNo: string
    materialCodeSnapshot: string
    materialNameSnapshot: string
    specificationSnapshot: string
    projectNameSnapshot: string
    constructionNo: string
    plannedStartDate: string | null
    orderQuantity: number
    status: string
    packingStatus: PackingStatus
    boardPieces: number
    packedPieces: number
    updateTime: string
  }>
> {
  const { data: types } = await responseHandle<Array<{ id: string }>>(
    () => supabase.from('mdm_document_type').select('id').eq('document_type_code', 'PP20'),
    readOptions
  )
  const typeIds = (types ?? []).map((type) => type.id)
  if (!typeIds.length) return []
  type OrderRow = {
    id: string
    tenantId: string
    workOrderNo: string
    materialCodeSnapshot: string
    materialNameSnapshot: string
    specificationSnapshot: string
    projectNameSnapshot: string
    constructionNo: string
    plannedStartDate: string | null
    orderQuantity: number
    status: string
    updateTime: string
    details: Array<{ pieces: number; packedPieces: number }>
  }
  const result = await fetchAllRangePages<OrderRow>(({ from, to }) => {
    let query = supabase
      .from('mes_work_order')
      .select(
        'id,tenant_id,work_order_no,material_code_snapshot,material_name_snapshot,specification_snapshot,project_name_snapshot,construction_no,planned_start_date,order_quantity,status,update_time,details:mes_work_order_detail(pieces,packed_pieces)'
      )
      .is('deleted_at', null)
      .neq('status', 'closed')
      .in('work_order_type_id', typeIds)
      .order('planned_start_date', { ascending: true })
      .range(from, to)
    if (tenantId) query = query.eq('tenant_id', tenantId)
    return responseHandle<OrderRow[]>(() => query, readOptions)
  })
  if (result.error) throw result.error
  return (result.data ?? []).map(({ details, ...order }) => {
    const boardPieces = details.reduce((total, detail) => total + Number(detail.pieces || 0), 0)
    const packedPieces = details.reduce(
      (total, detail) => total + Number(detail.packedPieces || 0),
      0
    )
    const packingStatus: PackingStatus =
      boardPieces > 0 && packedPieces >= boardPieces
        ? 'packed'
        : packedPieces > 0
          ? 'partial'
          : 'unpacked'
    return { ...order, boardPieces, packedPieces, packingStatus }
  })
}

export async function fetchWorkOrderBoards(workOrderId: string): Promise<WorkOrderBoard[]> {
  const { data } = await responseHandle<
    Array<{
      id: string
      tenantId: string
      workOrderId: string
      area: string
      axis: string
      number: string
      lengthMm: number
      widthMm: number
      areaSqm: number
      thicknessMm: number
      unitWeightKg: number | null
      pieces: number
      packedPieces: number
      remark: string
    }>
  >(
    () =>
      supabase
        .from('mes_work_order_detail')
        .select('*')
        .eq('work_order_id', workOrderId)
        .order('area')
        .order('number'),
    readOptions
  )
  return (data ?? []).map((row) => ({ ...row, boardNo: row.number }))
}

export async function savePackingBoardSpec(
  boardId: string,
  axis: string,
  thicknessMm: number,
  unitWeightKg: number | null
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('mes_save_packing_board_spec', {
        p_board_id: boardId,
        p_axis: axis,
        p_thickness_mm: thicknessMm,
        p_unit_weight_kg: unitWeightKg
      }),
    {
      breakReturn: true,
      showErrorMessage: true,
      requireAffected: false,
      errorMessage: '包装参数保存失败，请检查板材和排包权限'
    }
  )
}

export async function fetchWorkOrderPacks(workOrderId: string): Promise<WorkOrderPack[]> {
  const { data } = await responseHandle<WorkOrderPack[]>(
    () =>
      supabase
        .from('mes_work_order_pack')
        .select(
          'id,pack_no,area,axis,manually_adjusted,confirmed,remark,items:mes_work_order_pack_item(id,board_id,pieces,remark)'
        )
        .eq('work_order_id', workOrderId)
        .order('pack_no'),
    readOptions
  )
  return data ?? []
}

export async function savePackingPlan(
  workOrderId: string,
  packs: PackDraft[],
  revision: string
): Promise<string> {
  const { data } = await responseHandle<{ revision: string }>(
    () =>
      supabase.rpc('mes_save_packing_plan', {
        p_work_order_id: workOrderId,
        p_revision: revision,
        p_packs: keysToSnakeDeep(packs)
      }),
    {
      breakReturn: true,
      showErrorMessage: true,
      requireAffected: false,
      errorMessage: '排包保存失败，请刷新工单后核对数量与包号'
    }
  )
  if (!data?.revision) throw new Error('排包保存未返回版本，请刷新工单核对')
  return data.revision
}
