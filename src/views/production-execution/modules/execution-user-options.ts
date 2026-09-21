import type { ArtUserSelectOption } from '@/components/core/forms/art-user-select/types'
import type { MesExecutionPerson } from '@mes/api'

export function buildExecutionUserOptions(
  people: readonly MesExecutionPerson[]
): ArtUserSelectOption[] {
  return people.map((person) => ({
    value: person.id,
    label: person.name,
    nickName: person.name,
    secondaryText: person.employeeNo || '未设置工号',
    disabled: !person.enabled
  }))
}
