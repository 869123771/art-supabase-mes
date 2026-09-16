import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculatePlanFromEnd,
  calculatePlanFromStart,
  calculateProductionDays
} from './work-order-plan'

test('production days sum the four material production lead-time fields', () => {
  assert.equal(
    calculateProductionDays({
      productionFixedLeadDays: 2,
      productionPreprocessDays: 3,
      selfMadeProductionDays: 15,
      productionPostprocessDays: 1
    }),
    21
  )
})

test('planning from start adds production days', () => {
  assert.deepEqual(calculatePlanFromStart('2026-09-16', 17), {
    plannedStartDate: '2026-09-16',
    plannedEndDate: '2026-10-03'
  })
})

test('planning backwards clamps an expired start to today and recalculates the end', () => {
  assert.deepEqual(calculatePlanFromEnd('2026-09-20', 17, '2026-09-16'), {
    plannedStartDate: '2026-09-16',
    plannedEndDate: '2026-10-03'
  })
})

test('planning backwards keeps a future inferred start', () => {
  assert.deepEqual(calculatePlanFromEnd('2026-10-20', 17, '2026-09-16'), {
    plannedStartDate: '2026-10-03',
    plannedEndDate: '2026-10-20'
  })
})
