import assert from 'node:assert/strict'
import test from 'node:test'
import type { MesOperationTask } from '../../src/api/manufacturing.types'
import {
  conflictTaskIds,
  scheduleRisk,
  taskEndDate,
  taskStartDate
} from '../../src/views/scheduling/modules/schedule-policy'

function task(overrides: Partial<MesOperationTask>): MesOperationTask {
  return {
    id: overrides.id || crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    workOrderId: crypto.randomUUID(),
    sequenceNo: 10,
    sequenceType: 'standard',
    operationCode: 'OP10',
    operationName: '下料',
    plannedQuantity: 10,
    plannedStartDate: '2026-09-14',
    plannedEndDate: '2026-09-15',
    departmentId: null,
    workCenterId: '11111111-1111-4111-8111-111111111111',
    status: 'scheduled',
    reportedGoodQuantity: 0,
    reportedBadQuantity: 0,
    processContent: null,
    remark: '',
    closedAt: null,
    deletedAt: null,
    updateTime: '2026-09-14T00:00:00Z',
    ...overrides
  }
}

test('uses work-order dates as a fallback for an operation task', () => {
  const row = task({
    plannedStartDate: null,
    plannedEndDate: null,
    workOrder: {
      workOrderNo: 'MO-001',
      materialCodeSnapshot: 'MAT-001',
      materialNameSnapshot: '组件',
      plannedStartDate: '2026-09-20',
      plannedEndDate: '2026-09-22',
      urgency: 'normal'
    }
  })
  assert.equal(taskStartDate(row), '2026-09-20')
  assert.equal(taskEndDate(row), '2026-09-22')
})

test('marks overlapping tasks in the same work center as conflicts', () => {
  const first = task({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
  const second = task({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    plannedStartDate: '2026-09-15',
    plannedEndDate: '2026-09-16'
  })
  const separateCenter = task({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    workCenterId: '22222222-2222-4222-8222-222222222222'
  })
  const conflicts = conflictTaskIds([first, second, separateCenter])
  assert.deepEqual([...conflicts].sort(), [first.id, second.id].sort())
  assert.equal(scheduleRisk(first, conflicts), 'conflict')
})

test('unassigned tasks take precedence over date risk', () => {
  const row = task({ workCenterId: null, status: 'unscheduled', plannedEndDate: '2020-01-01' })
  assert.equal(scheduleRisk(row, new Set()), 'unassigned')
})
