import type { PackDraft, PackRule, WorkOrderBoard } from '@mes/api'

export const remainingPieces = (board: WorkOrderBoard, packs: PackDraft[]): number =>
  board.pieces -
  packs.reduce(
    (sum, pack) =>
      sum +
      pack.items
        .filter((item) => item.boardId === board.id)
        .reduce((n, item) => n + item.pieces, 0),
    0
  )

export function packTotals(pack: PackDraft, boards: WorkOrderBoard[]) {
  const entries = pack.items.map((item) => ({
    item,
    board: boards.find((board) => board.id === item.boardId)
  }))
  return {
    pieces: pack.items.reduce((sum, item) => sum + item.pieces, 0),
    lengthMm: entries.reduce(
      (sum, entry) => sum + (entry.board?.lengthMm || 0) * entry.item.pieces,
      0
    ),
    widthMm: Math.max(0, ...entries.map((entry) => entry.board?.widthMm || 0)),
    areaSqm: entries.reduce(
      (sum, entry) =>
        sum + (entry.board ? (entry.board.areaSqm / entry.board.pieces) * entry.item.pieces : 0),
      0
    ),
    weightKg: entries.reduce(
      (sum, entry) => sum + (entry.board?.unitWeightKg || 0) * entry.item.pieces,
      0
    ),
    stackHeightMm: entries.reduce(
      (sum, entry) => sum + (entry.board?.thicknessMm || 0) * entry.item.pieces,
      0
    )
  }
}

export function validatePlan(boards: WorkOrderBoard[], packs: PackDraft[]): string | null {
  const numbers = new Set<string>()
  for (const pack of packs) {
    if (!pack.packNo.trim()) return '请填写包号'
    if (numbers.has(pack.packNo.trim())) return `包号 ${pack.packNo} 重复`
    numbers.add(pack.packNo.trim())
    if (!pack.items.length) return `包号 ${pack.packNo} 没有板材`
    const origins = pack.items.map((item) => boards.find((board) => board.id === item.boardId))
    if (origins.some((board) => !board)) return '排包明细含有失效板材，请刷新工单'
    if (
      origins.some((board) => board?.area !== origins[0]?.area || board?.axis !== origins[0]?.axis)
    )
      return `包号 ${pack.packNo} 混入不同区域或轴线的板材`
    if (pack.items.some((item) => !Number.isInteger(item.pieces) || item.pieces < 1))
      return `包号 ${pack.packNo} 的块数必须为正整数`
  }
  for (const board of boards) {
    if (remainingPieces(board, packs) < 0) return `板材 ${board.boardNo} 超出工单块数`
  }
  return null
}

const sortKeys: Record<string, keyof WorkOrderBoard> = {
  area: 'area',
  width: 'widthMm',
  length: 'lengthMm',
  boardNo: 'boardNo'
}

export function suggestPacks(
  boards: WorkOrderBoard[],
  existing: PackDraft[],
  rule: PackRule,
  preserveManual: boolean
): PackDraft[] {
  const preserved = preserveManual ? existing.filter((pack) => pack.manuallyAdjusted) : []
  const packs = preserved.map((pack) => ({
    ...pack,
    items: pack.items.map((item) => ({ ...item }))
  }))
  const keys = rule.sortPriority
    .split(',')
    .map((key) => sortKeys[key])
    .filter(Boolean)
  const sorted = [...boards].sort((a, b) => {
    for (const key of keys) {
      const value = String(a[key]).localeCompare(String(b[key]), 'zh-CN', { numeric: true })
      if (value) return value
    }
    return a.id.localeCompare(b.id)
  })
  let serial = 1
  const nextNo = (): string => {
    let candidate = ''
    do candidate = `PK-${String(serial++).padStart(4, '0')}`
    while (packs.some((pack) => pack.packNo === candidate))
    return candidate
  }
  for (const board of sorted) {
    let remaining = remainingPieces(board, packs)
    if (
      (rule.maxLength && board.lengthMm > rule.maxLength) ||
      (rule.maxWeight && board.unitWeightKg == null)
    )
      continue
    while (remaining > 0) {
      const candidates = packs.filter((pack) => {
        if (pack.manuallyAdjusted) return false
        const first = boards.find((item) => item.id === pack.items[0]?.boardId)
        return (
          first?.area === board.area &&
          first.axis === board.axis &&
          (rule.remainderPolicy !== 'separate' || first.id === board.id) &&
          (rule.allowMixLength || first.lengthMm === board.lengthMm)
        )
      })
      if (rule.sameWidth)
        candidates.sort((a, b) => {
          const firstA = boards.find((item) => item.id === a.items[0]?.boardId)
          const firstB = boards.find((item) => item.id === b.items[0]?.boardId)
          return (
            Number(firstB?.widthMm === board.widthMm) - Number(firstA?.widthMm === board.widthMm)
          )
        })
      let target = candidates.find((pack) => {
        const totals = packTotals(pack, boards)
        return (
          totals.pieces < rule.maxPieces &&
          totals.stackHeightMm + board.thicknessMm <= rule.maxStackHeight &&
          (!rule.maxWeight ||
            board.unitWeightKg == null ||
            totals.weightKg + board.unitWeightKg <= rule.maxWeight)
        )
      })
      if (!target) {
        if (rule.remainderPolicy === 'manual' && remaining < rule.maxPieces) break
        target = {
          packNo: nextNo(),
          manuallyAdjusted: false,
          confirmed: false,
          remark: '',
          items: []
        }
        packs.push(target)
      }
      const totals = packTotals(target, boards)
      const capacity = Math.min(
        rule.maxPieces - totals.pieces,
        Math.floor((rule.maxStackHeight - totals.stackHeightMm) / board.thicknessMm),
        rule.maxWeight && board.unitWeightKg
          ? Math.floor((rule.maxWeight - totals.weightKg) / board.unitWeightKg)
          : remaining
      )
      if (capacity < 1) {
        if (!target.items.length) packs.pop()
        break
      }
      const pieces = Math.min(remaining, capacity)
      const item = target.items.find((item) => item.boardId === board.id)
      if (item) item.pieces += pieces
      else target.items.push({ boardId: board.id, pieces, remark: '' })
      remaining -= pieces
    }
  }
  return packs
}
