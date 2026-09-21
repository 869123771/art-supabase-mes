import assert from 'node:assert/strict'
import test from 'node:test'
import type { PackRule, WorkOrderBoard } from '../../src/api/packing'
import {
  packTotals,
  remainingPieces,
  suggestPacks,
  validatePlan
} from '../../src/views/packing/modules/packing-plan'

const rule: PackRule = {
  id: 'rule',
  tenantId: 'tenant',
  ruleCode: 'ROCK_BOARD',
  ruleName: '岩棉板',
  enabled: true,
  maxPieces: 8,
  maxStackHeight: 600,
  maxWeight: null,
  maxLength: null,
  sameWidth: true,
  sameArea: true,
  allowMixLength: false,
  remainderPolicy: 'separate',
  sortPriority: 'area,width,length,boardNo',
  remark: '',
  updateTime: ''
}
const board = (
  id: string,
  pieces: number,
  area = '一区',
  axis = 'A轴',
  lengthMm = 8000
): WorkOrderBoard => ({
  id,
  tenantId: 'tenant',
  workOrderId: 'order',
  area,
  axis,
  boardNo: id,
  lengthMm,
  widthMm: 1000,
  areaSqm: 8 * pieces,
  thicknessMm: 100,
  unitWeightKg: 18,
  pieces,
  packedPieces: 0,
  remark: ''
})

test('自动排包按块数和堆叠高度拆包，并保留人工调整的数量', () => {
  const boards = [board('a', 10), board('b', 2)]
  const manual = [
    {
      packNo: 'HAND-1',
      manuallyAdjusted: true,
      confirmed: true,
      remark: '',
      items: [{ boardId: 'a', pieces: 3, remark: '' }]
    }
  ]
  const packs = suggestPacks(boards, manual, rule, true)
  assert.equal(packs[0].packNo, 'HAND-1')
  assert.equal(packs[0].items[0].pieces, 3)
  assert.equal(
    packs.reduce((sum, pack) => sum + packTotals(pack, boards).pieces, 0),
    12
  )
  assert.ok(packs.every((pack) => packTotals(pack, boards).stackHeightMm <= 600))
  assert.equal(remainingPieces(boards[0], packs), 0)
})

test('不同区域或轴线不能混包，超排会被拒绝', () => {
  const boards = [board('a', 2), board('b', 2, '一区', 'B轴')]
  const mixed = [
    {
      packNo: 'P1',
      manuallyAdjusted: true,
      confirmed: false,
      remark: '',
      items: [
        { boardId: 'a', pieces: 2, remark: '' },
        { boardId: 'b', pieces: 2, remark: '' }
      ]
    }
  ]
  assert.match(validatePlan(boards, mixed) || '', /不同区域或轴线/)
  mixed[0].items.pop()
  mixed[0].items[0].pieces = 3
  assert.match(validatePlan(boards, mixed) || '', /超出工单块数/)
})

test('尾数独立小包不会并入下一行板材，合并策略可以共包', () => {
  const boards = [board('a', 2), board('b', 2)]
  const limits = { ...rule, maxStackHeight: 1000 }
  const separate = suggestPacks(boards, [], limits, true)
  const merged = suggestPacks(boards, [], { ...limits, remainderPolicy: 'merge' }, true)
  assert.equal(separate.length, 2)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].items.length, 2)
})
