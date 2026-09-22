<template>
  <ArtPermissionGuard permission="MesPacking:View" resource-name="排包单">
    <div
      class="packing-page business-workspace-page art-full-height"
      :class="{ 'is-focus-mode': focusMode }"
    >
      <BusinessWorkspaceHeader
        v-show="!focusMode"
        eyebrow="PACKING WORKSPACE"
        title="排包单"
        description="从生产工单板材明细生成推荐方案，再按实际出库单元调整包号和块数。"
        icon="ri:archive-line"
        :metrics="selectedOrder && boards.length ? metrics : []"
        density="compact"
        refreshable
        :refresh-loading="loading"
        @refresh="refresh"
      >
        <template #actions>
          <ElButton
            v-auth="'MesPacking:Auto'"
            :disabled="!selectedOrder || !boards.length || busy"
            @click="autoPack"
          >
            <ArtSvgIcon icon="ri:magic-line" />自动排包
          </ElButton>
          <ElButton
            v-auth="'MesPacking:Save'"
            type="primary"
            :loading="busy"
            :disabled="!selectedOrder || !dirty"
            @click="save"
          >
            <ArtSvgIcon icon="ri:save-line" />保存数据
          </ElButton>
        </template>
      </BusinessWorkspaceHeader>

      <div class="packing-page__content business-workspace-content">
        <ArtSectionCard
          class="packing-page__orders"
          title="待排生产工单"
          :subtitle="`PP20 板材加工 · 当前 ${visibleOrders.length} 单`"
          :loading="loading"
          :error="error"
          :empty="!loading && !error && !orders.length"
          empty-title="暂无板材加工工单"
          empty-description="请先在生产工单中创建 PP20 板材加工工单。"
          @retry="loadOrders"
        >
          <div class="packing-page__filters">
            <ElInput
              v-model="keyword"
              clearable
              placeholder="工单、物料、规格、项目或施工号"
              aria-label="组合查询工单"
            >
              <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
            </ElInput>
            <ElDatePicker
              v-model="startDates"
              type="daterange"
              value-format="YYYY-MM-DD"
              start-placeholder="开工起"
              end-placeholder="开工止"
              unlink-panels
              clearable
              aria-label="要求开工日期区间"
            />
            <ElCheckbox v-model="includePacked">包含已排包</ElCheckbox>
          </div>
          <ElScrollbar class="packing-page__order-scroll" always>
            <div v-if="visibleOrders.length" class="packing-page__order-list">
              <button
                v-for="order in visibleOrders"
                :key="order.id"
                type="button"
                class="packing-page__order"
                :class="{ 'is-selected': order.id === orderId }"
                :aria-pressed="order.id === orderId"
                @click="chooseOrder(order.id)"
              >
                <span class="packing-page__order-top">
                  <strong>{{ order.workOrderNo }}</strong>
                  <span>{{ order.packedPieces }}/{{ order.boardPieces }} 块</span>
                </span>
                <span class="packing-page__order-name" :title="order.materialNameSnapshot">{{
                  order.materialNameSnapshot
                }}</span>
                <span class="packing-page__order-bottom">
                  <span>{{ order.projectNameSnapshot || '未关联项目' }}</span>
                  <time>{{ order.plannedStartDate || '未设开工日' }}</time>
                </span>
              </button>
            </div>
            <ArtEmptyState
              v-else-if="!loading && !error"
              title="当前条件下没有工单"
              description="可清除日期或勾选已排包后重试。"
              size="compact"
            />
          </ElScrollbar>
          <div class="packing-page__rule-field">
            <span>自动排包规则</span>
            <ElSelect
              v-model="selectedRuleId"
              :disabled="!selectedOrder"
              placeholder="选择板材排包规则"
              aria-label="板材排包规则"
            >
              <ElOption
                v-for="rule in scopedRules"
                :key="rule.id"
                :label="rule.ruleName"
                :value="rule.id"
              />
            </ElSelect>
          </div>
        </ArtSectionCard>
        <div class="packing-page__main">
          <ArtSectionCard
            v-if="selectedOrder && !detailLoading && (!boards.length || detailError)"
            class="packing-page__single-state"
            title="工单板材明细"
            :error="detailError"
            :empty="!detailError"
            empty-title="该工单尚无板材明细"
            empty-description="先在生产工单登记成品板的区域、编号、长宽和块数，再回来排包。"
            @retry="loadDetails"
          >
            <template #empty-action>
              <ElButton v-auth="'MesWorkOrder:Edit'" type="primary" @click="openWorkOrder">
                前往维护工单明细
              </ElButton>
            </template>
          </ArtSectionCard>
          <div v-else-if="selectedOrder" class="packing-page__workspace business-workspace-content">
            <ArtSectionCard
              class="packing-page__panel"
              title="工单板材明细"
              :subtitle="`剩余 ${remainingTotal} 块 · 双击明细可直接排包，也可勾选后批量排包`"
              :loading="detailLoading"
              :error="detailError"
              :empty="!detailLoading && !detailError && !boards.length"
              empty-title="工单尚无板材明细"
              empty-description="先登记成品板的区域、轴线、尺寸和块数。"
              @retry="loadDetails"
            >
              <ArtTableHeader
                v-model:focus-mode="focusMode"
                layout="refresh,size,fullscreen,settings"
                full-class="packing-page__workspace"
                :loading="detailLoading"
                @refresh="refresh"
              >
                <template #left>
                  <ElButton
                    v-auth="'MesPacking:Manual'"
                    :disabled="!selectedBoards.length"
                    @click="createPack"
                  >
                    <ArtSvgIcon icon="ri:archive-stack-line" />批量排包
                  </ElButton>
                  <ElButton
                    v-auth="'MesPacking:Manual'"
                    :disabled="!selectedBoards.length || !selectedPack"
                    @click="mergeSelected"
                  >
                    <ArtSvgIcon icon="ri:git-merge-line" />并入选中包
                  </ElButton>
                  <ElButton type="primary" plain @click="openResults">
                    <ArtSvgIcon icon="ri:archive-line" />排包结果 · {{ packs.length }} 包
                  </ElButton>
                  <ElButton
                    v-if="focusMode"
                    v-auth="'MesPacking:Auto'"
                    :disabled="!boards.length || busy"
                    @click="autoPack"
                  >
                    <ArtSvgIcon icon="ri:magic-line" />自动排包
                  </ElButton>
                  <ElButton
                    v-if="focusMode"
                    v-auth="'MesPacking:Save'"
                    type="primary"
                    :loading="busy"
                    :disabled="!dirty"
                    @click="save"
                  >
                    <ArtSvgIcon icon="ri:save-line" />保存数据
                  </ElButton>
                  <ElButton v-auth="'MesWorkOrder:Edit'" @click="openWorkOrder">
                    <ArtSvgIcon icon="ri:external-link-line" />查看生产单明细
                  </ElButton>
                </template>
              </ArtTableHeader>
              <ArtTable
                ref="boardTableRef"
                :data="boards"
                :columns="[]"
                :pagination="false"
                :row-class-name="boardRowClass"
                height="100%"
                scrollbar-always-on
                row-key="id"
                @selection-change="selectedBoards = $event"
                @row-dblclick="addBoard"
              >
                <ElTableColumn type="selection" width="40" />
                <ElTableColumn label="区域" width="88" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span :title="`轴线：${row.axis || '待维护'}`">{{ row.area }}</span>
                  </template>
                </ElTableColumn>
                <ElTableColumn label="编号" width="84" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span
                      :draggable="canManual"
                      class="packing-page__drag"
                      title="可通过排包按钮加入当前包"
                      @dragstart="dragBoard($event, row.id)"
                      >{{ row.boardNo }}</span
                    >
                  </template>
                </ElTableColumn>
                <ElTableColumn label="长度 mm" width="90" align="right">
                  <template #default="{ row }">{{ row.lengthMm }}</template>
                </ElTableColumn>
                <ElTableColumn label="块数" width="64" align="right">
                  <template #default="{ row }">{{ row.pieces }}</template>
                </ElTableColumn>
                <ElTableColumn label="已排包块数" width="96" align="right">
                  <template #default="{ row }">{{ packedForRow(row) }}</template>
                </ElTableColumn>
                <ElTableColumn label="延米 m" width="82" align="right">
                  <template #default="{ row }">{{
                    ((row.lengthMm * row.pieces) / 1000).toFixed(2)
                  }}</template>
                </ElTableColumn>
                <ElTableColumn label="面积 ㎡" width="82" align="right">
                  <template #default="{ row }">{{ areaForRow(row).toFixed(2) }}</template>
                </ElTableColumn>
                <ElTableColumn label="备注" min-width="110" show-overflow-tooltip>
                  <template #default="{ row }">{{ row.remark || '—' }}</template>
                </ElTableColumn>
                <ElTableColumn label="操作" width="110" fixed="right">
                  <template #default="{ row }">
                    <ElButton
                      v-auth="'MesPacking:Manual'"
                      link
                      type="primary"
                      @click="addBoard(row)"
                      >排包</ElButton
                    >
                    <ElButton v-auth="'MesPacking:Spec'" link @click="openSpec(row)">参数</ElButton>
                  </template>
                </ElTableColumn>
              </ArtTable>
            </ArtSectionCard>

            <ArtDialog
              ref="resultsDialogRef"
              title="排包结果"
              :subtitle="`${selectedOrder.workOrderNo} · 已排 ${packedTotal} 块 / 待排 ${remainingTotal} 块 · 共 ${packs.length} 包`"
              size="xl"
              align-center
              content-max-height="65vh"
              scrollbar-always
            >
              <ArtSectionCard
                class="packing-results border-0! shadow-none! p-0!"
                title="包清单"
                :subtitle="`已选 ${selectedPacks.length} 包 · 勾选多个包可合包，勾选包内明细可拆包`"
                :loading="detailLoading"
                :error="detailError"
                :empty="!detailLoading && !detailError && !packs.length"
                empty-title="尚未排包"
                empty-description="可从左侧选中板材新建包，或生成自动推荐方案。"
                @retry="loadDetails"
              >
                <template #actions>
                  <ElButton
                    v-auth="'MesPacking:Manual'"
                    :disabled="selectedPacks.length < 2"
                    @click="mergePacks"
                    ><ArtSvgIcon icon="ri:git-merge-line" />合包</ElButton
                  >
                  <ElButton
                    v-auth="'MesPacking:Manual'"
                    :disabled="!selectedPack || !selectedPackItems.length"
                    @click="splitPack"
                    ><ArtSvgIcon icon="ri:git-branch-line" />拆包</ElButton
                  >
                </template>
                <template #empty-action>
                  <ElButton v-auth="'MesPacking:Auto'" type="primary" @click="autoPack">
                    自动生成推荐方案
                  </ElButton>
                </template>
                <div
                  class="packing-page__pack-list"
                  aria-label="排包列表"
                  @dragover.prevent
                  @drop="dropToUnpacked"
                >
                  <div class="packing-page__drop-hint"
                    ><ArtSvgIcon icon="ri:drag-move-2-line" />
                    将包内板材拖到此处退回待排区，也可点击行末“移出”</div
                  >
                  <div
                    v-for="pack in packs"
                    :key="pack.id || pack.packNo"
                    class="packing-page__pack"
                    :class="{ 'packing-page__pack--selected': selectedPack === pack }"
                    @dragover.prevent
                    @drop.stop="dropToPack($event, pack)"
                  >
                    <div class="packing-page__pack-head">
                      <ElCheckbox
                        v-auth="'MesPacking:Manual'"
                        :model-value="selectedPacks.includes(pack)"
                        :aria-label="`选择包 ${pack.packNo} 以合包`"
                        @change="togglePackSelection(pack)"
                      />
                      <button
                        type="button"
                        class="packing-page__pack-select"
                        :aria-label="`选择包 ${pack.packNo}`"
                        @click="selectPack(pack)"
                      >
                        <ArtSvgIcon icon="ri:archive-line" />
                        <strong>{{ pack.packNo }}</strong>
                        <ElTag
                          v-if="pack.manuallyAdjusted"
                          type="warning"
                          size="small"
                          effect="plain"
                          >人工调整</ElTag
                        >
                        <ElTag v-if="pack.confirmed" type="success" size="small" effect="plain"
                          >已确认</ElTag
                        >
                      </button>
                      <ElCheckbox
                        v-model="pack.confirmed"
                        v-auth="'MesPacking:Save'"
                        label="确认"
                        @change="confirmPack(pack)"
                      />
                    </div>
                    <div class="packing-page__pack-meta">
                      <span>{{ packArea(pack) }} / {{ packAxis(pack) }}</span>
                      <span>{{ packTotals(pack, boards).pieces }} 块</span>
                      <span
                        >延米 {{ (packTotals(pack, boards).lengthMm / 1000).toFixed(2) }} m</span
                      >
                      <span>最宽 {{ packTotals(pack, boards).widthMm }} mm</span>
                      <span>{{ packTotals(pack, boards).areaSqm.toFixed(2) }} ㎡</span>
                      <span>{{ packTotals(pack, boards).weightKg.toFixed(1) }} kg</span>
                      <span>堆叠 {{ packTotals(pack, boards).stackHeightMm }} mm</span>
                    </div>
                    <div class="packing-page__pack-fields">
                      <ElInput
                        v-model="pack.packNo"
                        :disabled="!canManual"
                        aria-label="包号"
                        placeholder="包号"
                        maxlength="60"
                        @change="markManual(pack)"
                      />
                      <ElInput
                        v-model="pack.remark"
                        :disabled="!canManual"
                        aria-label="包备注"
                        placeholder="打包标识 / 备注"
                        maxlength="200"
                        @change="markManual(pack)"
                      />
                    </div>
                    <ArtTable
                      height="auto"
                      :data="pack.items"
                      :columns="[]"
                      :pagination="false"
                      table-layout="fixed"
                      scrollbar-always-on
                      @selection-change="selectPackItems(pack, $event)"
                    >
                      <ElTableColumn type="selection" width="36" />
                      <ElTableColumn label="包号" width="150" show-overflow-tooltip>
                        <template #default>{{ pack.packNo }}</template>
                      </ElTableColumn>
                      <ElTableColumn label="区域" width="100" show-overflow-tooltip>
                        <template #default="{ row: item }">{{
                          boardById(item.boardId)?.area || '—'
                        }}</template>
                      </ElTableColumn>
                      <ElTableColumn label="编号" min-width="160">
                        <template #default="{ row: item }">
                          <span
                            :draggable="canManual"
                            class="packing-page__drag"
                            title="拖出包"
                            @dragstart="dragPackItem($event, pack, item.boardId)"
                          >
                            {{ boardById(item.boardId)?.boardNo || '板材已失效' }}
                          </span>
                        </template>
                      </ElTableColumn>
                      <ElTableColumn label="长度 mm" width="120" align="right">
                        <template #default="{ row: item }">{{
                          boardById(item.boardId)?.lengthMm
                        }}</template>
                      </ElTableColumn>
                      <ElTableColumn label="块数" width="92">
                        <template #default="{ row: item }">
                          <ElInputNumber
                            v-model="item.pieces"
                            :disabled="!canManual"
                            :min="1"
                            :max="availableForItem(item.boardId, item.pieces)"
                            :precision="0"
                            :controls="false"
                            class="w-full!"
                            aria-label="本包块数"
                            @change="markManual(pack)"
                          />
                        </template>
                      </ElTableColumn>
                      <ElTableColumn label="延米 m" width="110" align="right">
                        <template #default="{ row: item }">{{
                          itemMeters(item.boardId, item.pieces).toFixed(2)
                        }}</template>
                      </ElTableColumn>
                      <ElTableColumn label="面积 ㎡" width="110" align="right">
                        <template #default="{ row: item }">{{
                          itemArea(item.boardId, item.pieces).toFixed(2)
                        }}</template>
                      </ElTableColumn>
                      <ElTableColumn label="操作" width="80" fixed="right">
                        <template #default="{ row: item }">
                          <ElButton
                            v-auth="'MesPacking:Manual'"
                            link
                            type="danger"
                            :aria-label="`移出 ${boardById(item.boardId)?.boardNo}`"
                            @click="removeItem(pack, item.boardId)"
                            >移出</ElButton
                          >
                        </template>
                      </ElTableColumn>
                    </ArtTable>
                  </div>
                </div>
              </ArtSectionCard>
              <template #footer="{ api }">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div aria-live="polite">
                    <ElTag v-if="dirty" type="warning" effect="light">有未保存调整</ElTag>
                  </div>
                  <div class="flex items-center gap-2 [&_.el-button]:ml-0!">
                    <ElButton @click="api.handleClose()">
                      <ArtSvgIcon icon="ri:arrow-go-back-line" />返回继续排包
                    </ElButton>
                    <ElButton
                      v-auth="'MesPacking:Save'"
                      type="primary"
                      :loading="busy"
                      :disabled="!dirty"
                      @click="save"
                    >
                      <ArtSvgIcon icon="ri:save-line" />保存排包结果
                    </ElButton>
                  </div>
                </div>
              </template>
            </ArtDialog>
          </div>
          <ArtSectionCard
            v-else
            class="packing-page__start"
            title="开始排包"
            empty
            empty-title="请选择生产工单"
            empty-description="从左侧 PP20 工单列表选择一单，查看板材明细并进行排包。"
          />
        </div>
      </div>
      <PackingBoardSpecDialog ref="specDialogRef" @success="loadDetails" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { cloneDeep } from 'lodash-es'
  import { storeToRefs } from 'pinia'
  import { useRouter } from 'vue-router'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtTableHeader from '@/components/core/tables/art-table-header/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useWorkspaceFocus } from '@/hooks/core/useWorkspaceFocus'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    fetchPackingOrders,
    fetchPackRules,
    fetchWorkOrderBoards,
    fetchWorkOrderPacks,
    savePackingPlan,
    type PackDraft,
    type PackRule,
    type WorkOrderBoard
  } from '@mes/api'
  import { packTotals, remainingPieces, suggestPacks, validatePlan } from './modules/packing-plan'
  import PackingBoardSpecDialog from './modules/packing-board-spec-dialog.vue'

  defineOptions({ name: 'MesPacking' })
  const declaredPermissions = [
    'MesPacking:View',
    'MesPacking:Spec',
    'MesPacking:Auto',
    'MesPacking:Manual',
    'MesPacking:Save'
  ] as const
  void declaredPermissions
  type Order = Awaited<ReturnType<typeof fetchPackingOrders>>[number]
  const tenantScope = useTenantScopeStore()
  const router = useRouter()
  const { effectiveTenantId } = storeToRefs(tenantScope)
  const { confirm, promptText } = useArtFeedback()
  const { focusMode } = useWorkspaceFocus()
  const { hasAuth } = useAuth()
  const canManual = computed(() => hasAuth('MesPacking:Manual'))
  const orders = ref<Order[]>([])
  const rules = ref<PackRule[]>([])
  const selectedRuleId = ref('')
  const orderId = ref('')
  const keyword = ref('')
  const startDates = ref<string[]>([
    dayjs().format('YYYY-MM-DD'),
    dayjs().add(2, 'day').format('YYYY-MM-DD')
  ])
  const includePacked = ref(false)
  const boards = ref<WorkOrderBoard[]>([])
  const packs = ref<PackDraft[]>([])
  const selectedBoards = ref<WorkOrderBoard[]>([])
  const selectedPack = shallowRef<PackDraft | null>(null)
  const selectedPacks = ref<PackDraft[]>([])
  const selectedPackItems = ref<PackDraft['items']>([])
  const boardTableRef = ref<ArtTableExpose>()
  const resultsDialogRef = ref<ArtDialogExpose>()
  async function openResults(): Promise<void> {
    await nextTick()
    await resultsDialogRef.value?.handleOpen()
  }
  const specDialogRef = ref<{ handleOpen: (row: WorkOrderBoard) => Promise<void> }>()
  const loading = ref(false)
  const detailLoading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const detailError = ref('')
  const dirty = ref(false)
  const revision = ref('')
  const selectedOrder = computed(() => orders.value.find((order) => order.id === orderId.value))
  const visibleOrders = computed(() => {
    const needle = keyword.value.trim().toLocaleLowerCase()
    const [from, to] = startDates.value || []
    return orders.value.filter((order) => {
      if (!includePacked.value && order.packingStatus === 'packed') return false
      if (from && (!order.plannedStartDate || order.plannedStartDate < from)) return false
      if (to && (!order.plannedStartDate || order.plannedStartDate > to)) return false
      if (!needle) return true
      return [
        order.workOrderNo,
        order.materialCodeSnapshot,
        order.materialNameSnapshot,
        order.specificationSnapshot,
        order.projectNameSnapshot,
        order.constructionNo
      ].some((value) => (value || '').toLocaleLowerCase().includes(needle))
    })
  })
  const scopedRules = computed(() =>
    rules.value.filter((rule) => rule.enabled && rule.tenantId === selectedOrder.value?.tenantId)
  )
  const suggestedRule = computed(() => {
    const name = selectedOrder.value?.materialNameSnapshot || ''
    const code = /岩棉|rock/i.test(name)
      ? 'ROCK_BOARD'
      : /聚氨酯|\bPU\b|PIR/i.test(name)
        ? 'PU_BOARD'
        : ''
    return scopedRules.value.find((rule) => rule.ruleCode === code)
  })
  const remaining = (board: WorkOrderBoard): number => remainingPieces(board, packs.value)
  const packed = (board: WorkOrderBoard): number => board.pieces - remaining(board)
  const packedForRow = (row: Record<string, unknown>): number => {
    const board = typeof row.id === 'string' ? boardById(row.id) : undefined
    return board ? packed(board) : 0
  }
  const areaForRow = (row: Record<string, unknown>): number => {
    const board = typeof row.id === 'string' ? boardById(row.id) : undefined
    return board?.areaSqm ?? 0
  }
  const packedTotal = computed(() => boards.value.reduce((sum, board) => sum + packed(board), 0))
  const remainingTotal = computed(() =>
    boards.value.reduce((sum, board) => sum + remaining(board), 0)
  )
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '工单板材',
      value: boards.value.reduce((sum, board) => sum + board.pieces, 0),
      description: '块',
      icon: 'ri:layout-grid-line'
    },
    {
      label: '已排包',
      value: packedTotal.value,
      description: `${packs.value.length} 包`,
      icon: 'ri:archive-line',
      tone: 'primary'
    },
    {
      label: '待打包',
      value: remainingTotal.value,
      description: '块',
      icon: 'ri:inbox-line',
      tone: remainingTotal.value ? 'warning' : 'success'
    }
  ])
  const boardById = (id: string): WorkOrderBoard | undefined =>
    boards.value.find((board) => board.id === id)
  const availableForItem = (id: string, current: number): number => {
    const board = boardById(id)
    return board ? current + remaining(board) : current
  }
  const itemMeters = (id: string, pieces: number): number =>
    ((boardById(id)?.lengthMm || 0) * pieces) / 1000
  const itemArea = (id: string, pieces: number): number => {
    const board = boardById(id)
    return board ? (board.areaSqm / board.pieces) * pieces : 0
  }
  const packArea = (pack: PackDraft): string => boardById(pack.items[0]?.boardId)?.area || '—'
  const packAxis = (pack: PackDraft): string => boardById(pack.items[0]?.boardId)?.axis || '—'
  const boardRowClass = ({ row }: { row: WorkOrderBoard }): string =>
    remaining(row) === 0 ? 'packing-page__complete' : ''

  async function loadOrders(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await tenantScope.loadTenantOptions()
      ;[orders.value, rules.value] = await Promise.all([
        fetchPackingOrders(effectiveTenantId.value),
        fetchPackRules(effectiveTenantId.value)
      ])
      if (orderId.value && !orders.value.some((order) => order.id === orderId.value)) {
        orderId.value = ''
        boards.value = []
        packs.value = []
      }
    } catch {
      error.value = '工单与规则加载失败，请重试。'
    } finally {
      loading.value = false
    }
  }
  async function loadDetails(): Promise<void> {
    if (!orderId.value) return
    detailLoading.value = true
    detailError.value = ''
    try {
      const [boardRows, packRows] = await Promise.all([
        fetchWorkOrderBoards(orderId.value),
        fetchWorkOrderPacks(orderId.value)
      ])
      boards.value = boardRows
      packs.value = packRows.map((pack) => ({
        id: pack.id,
        packNo: pack.packNo,
        manuallyAdjusted: pack.manuallyAdjusted,
        confirmed: pack.confirmed,
        remark: pack.remark,
        items: pack.items.map((item) => ({
          boardId: item.boardId,
          pieces: item.pieces,
          remark: item.remark
        }))
      }))
      selectedPack.value = null
      selectedPacks.value = []
      selectedPackItems.value = []
      dirty.value = false
      revision.value = selectedOrder.value?.updateTime || ''
    } catch {
      detailError.value = '板材和排包明细加载失败，请重试。'
    } finally {
      detailLoading.value = false
    }
  }
  async function selectOrder(): Promise<void> {
    if (dirty.value) {
      try {
        await confirm('切换工单将放弃未保存的排包调整，确认继续？', { title: '切换工单' })
      } catch {
        orderId.value = boards.value[0]?.workOrderId || ''
        return
      }
    }
    boards.value = []
    packs.value = []
    selectedRuleId.value = suggestedRule.value?.id || ''
    if (orderId.value) await loadDetails()
  }
  function chooseOrder(id: string): void {
    if (orderId.value === id) return
    orderId.value = id
    void selectOrder()
  }
  async function refresh(): Promise<void> {
    if (dirty.value) {
      try {
        await confirm('刷新将放弃未保存的排包调整，确认继续？', { title: '刷新排包单' })
      } catch {
        return
      }
    }
    await loadOrders()
    await loadDetails()
  }
  function openWorkOrder(): void {
    void router.push({ name: 'MesWorkOrder' })
  }
  function openSpec(row: Record<string, unknown>): void {
    if (dirty.value) {
      ElMessage.warning('请先保存当前排包方案，再维护包装参数')
      return
    }
    const board = typeof row.id === 'string' ? boardById(row.id) : undefined
    if (board) void specDialogRef.value?.handleOpen(board)
  }
  function markManual(pack: PackDraft): void {
    pack.manuallyAdjusted = true
    pack.confirmed = false
    dirty.value = true
  }
  function confirmPack(pack: PackDraft): void {
    pack.manuallyAdjusted = true
    dirty.value = true
  }
  function nextPackNo(): string {
    let serial = 1
    let candidate = ''
    do candidate = `PK-${String(serial++).padStart(4, '0')}`
    while (packs.value.some((pack) => pack.packNo === candidate))
    return candidate
  }
  function selectPack(pack: PackDraft): void {
    selectedPack.value = pack
    selectedPackItems.value = []
  }
  function selectPackItems(pack: PackDraft, items: PackDraft['items']): void {
    if (items.length) selectedPack.value = pack
    if (selectedPack.value === pack) selectedPackItems.value = items
  }
  function togglePackSelection(pack: PackDraft): void {
    selectedPacks.value = selectedPacks.value.includes(pack)
      ? selectedPacks.value.filter((item) => item !== pack)
      : [...selectedPacks.value, pack]
  }
  function addPieces(board: WorkOrderBoard, pack: PackDraft, amount = remaining(board)): void {
    if (!canManual.value) return
    if (!board.axis || board.thicknessMm <= 0) {
      ElMessage.warning(`请先维护板材 ${board.boardNo} 的轴线与成品厚度`)
      return
    }
    if (amount < 1) return
    const first = boardById(pack.items[0]?.boardId)
    if (first && (first.area !== board.area || first.axis !== board.axis)) {
      ElMessage.warning('不同区域或轴线的板材不能排在同一包')
      return
    }
    const item = pack.items.find((entry) => entry.boardId === board.id)
    if (item) item.pieces += amount
    else pack.items.push({ boardId: board.id, pieces: amount, remark: '' })
    markManual(pack)
  }
  function createPack(): void {
    if (!canManual.value) return
    const rows = selectedBoards.value.filter((board) => remaining(board) > 0)
    if (!rows.length) return
    if (rows.some((row) => !row.axis || row.thicknessMm <= 0)) {
      ElMessage.warning('请先维护所选板材的轴线与成品厚度')
      return
    }
    const first = rows[0]
    if (rows.some((row) => row.area !== first.area || row.axis !== first.axis)) {
      ElMessage.warning('请选择相同区域和轴线的板材新建包')
      return
    }
    const pack: PackDraft = {
      packNo: nextPackNo(),
      manuallyAdjusted: true,
      confirmed: false,
      remark: '',
      items: []
    }
    packs.value.push(pack)
    const addedPack = packs.value[packs.value.length - 1]
    rows.forEach((row) => addPieces(row, addedPack))
    selectedPack.value = addedPack
    boardTableRef.value?.elTableRef?.clearSelection()
  }
  function mergeSelected(): void {
    if (!canManual.value) return
    if (!selectedPack.value) return
    selectedBoards.value.forEach((board) => addPieces(board, selectedPack.value!))
    boardTableRef.value?.elTableRef?.clearSelection()
  }
  function addBoard(row: Record<string, unknown>): void {
    const board = typeof row.id === 'string' ? boardById(row.id) : undefined
    if (!board) return
    if (!canManual.value) {
      ElMessage.warning('当前账号没有手动排包权限')
      return
    }
    if (remaining(board) <= 0) {
      ElMessage.info('该明细已全部排包，可在排包结果中调整')
      void openResults()
      return
    }
    const before = remaining(board)
    if (selectedPack.value) addPieces(board, selectedPack.value)
    else {
      selectedBoards.value = [board]
      createPack()
    }
    if (remaining(board) < before) {
      ElMessage.success(`已排入 ${selectedPack.value?.packNo}，尚未保存`)
      void openResults()
    }
  }
  function removeItem(pack: PackDraft, boardId: string): void {
    if (!canManual.value) return
    pack.items = pack.items.filter((item) => item.boardId !== boardId)
    if (!pack.items.length) {
      packs.value = packs.value.filter((item) => item !== pack)
      selectedPack.value = null
    } else markManual(pack)
    dirty.value = true
  }
  function mergePacks(): void {
    if (!canManual.value || selectedPacks.value.length < 2) return
    const [target, ...sources] = selectedPacks.value
    const first = boardById(target.items[0]?.boardId)
    if (
      sources.some((pack) => {
        const board = boardById(pack.items[0]?.boardId)
        return board?.area !== first?.area || board?.axis !== first?.axis
      })
    ) {
      ElMessage.warning('不同区域或轴线的包不能合包')
      return
    }
    for (const source of sources) {
      for (const item of source.items) {
        const existing = target.items.find((entry) => entry.boardId === item.boardId)
        if (existing) existing.pieces += item.pieces
        else target.items.push({ ...item })
      }
    }
    packs.value = packs.value.filter((pack) => !sources.includes(pack))
    selectedPacks.value = []
    selectedPackItems.value = []
    selectedPack.value = target
    markManual(target)
  }
  async function splitPack(): Promise<void> {
    if (!canManual.value) return
    const source = selectedPack.value
    if (!source || !selectedPackItems.value.length) return
    const chosen = selectedPackItems.value.filter((item) => source.items.includes(item))
    if (!chosen.length) return
    let moved: PackDraft['items']
    if (chosen.length === source.items.length) {
      if (chosen.length !== 1 || chosen[0].pieces < 2) {
        ElMessage.warning('请只选择包内部分明细；单行明细至少需要 2 块才能拆包')
        return
      }
      let pieces: number
      try {
        pieces = Number(
          await promptText(`本行共 ${chosen[0].pieces} 块，请输入移入新包的块数`, '拆包块数', {
            initialValue: '1',
            maxLength: 8
          })
        )
      } catch {
        return
      }
      if (!Number.isInteger(pieces) || pieces < 1 || pieces >= chosen[0].pieces) {
        ElMessage.warning(`拆包块数应为 1～${chosen[0].pieces - 1} 的整数`)
        return
      }
      chosen[0].pieces -= pieces
      moved = [{ ...chosen[0], pieces }]
    } else {
      moved = chosen.map((item) => ({ ...item }))
      source.items = source.items.filter((item) => !chosen.includes(item))
    }
    const created: PackDraft = {
      packNo: nextPackNo(),
      manuallyAdjusted: true,
      confirmed: false,
      remark: '',
      items: moved
    }
    packs.value.push(created)
    selectedPackItems.value = []
    selectedPack.value = created
    markManual(source)
  }
  function dragBoard(event: DragEvent, boardId: string): void {
    event.dataTransfer?.setData('text/plain', JSON.stringify({ boardId }))
  }
  function dragPackItem(event: DragEvent, pack: PackDraft, boardId: string): void {
    event.dataTransfer?.setData('text/plain', JSON.stringify({ boardId, from: pack.packNo }))
    event.stopPropagation()
  }
  function dragged(event: DragEvent): { boardId: string; from?: string } | null {
    try {
      const parsed: unknown = JSON.parse(event.dataTransfer?.getData('text/plain') || 'null')
      if (
        parsed &&
        typeof parsed === 'object' &&
        'boardId' in parsed &&
        typeof parsed.boardId === 'string'
      )
        return {
          boardId: parsed.boardId,
          from: 'from' in parsed && typeof parsed.from === 'string' ? parsed.from : undefined
        }
    } catch {
      /* Ignore unrelated drag payloads. */
    }
    return null
  }
  function dropToPack(event: DragEvent, target: PackDraft): void {
    if (!canManual.value) return
    const payload = dragged(event)
    if (!payload || payload.from === target.packNo) return
    const board = boardById(payload.boardId)
    if (!board) return
    const first = boardById(target.items[0]?.boardId)
    if (first && (first.area !== board.area || first.axis !== board.axis)) {
      ElMessage.warning('不同区域或轴线的板材不能排在同一包')
      return
    }
    const source = packs.value.find((pack) => pack.packNo === payload.from)
    const count =
      source?.items.find((item) => item.boardId === board.id)?.pieces || remaining(board)
    if (source) removeItem(source, board.id)
    addPieces(board, target, count)
  }
  function dropToUnpacked(event: DragEvent): void {
    if (!canManual.value) return
    const payload = dragged(event)
    const source = packs.value.find((pack) => pack.packNo === payload?.from)
    if (source && payload) removeItem(source, payload.boardId)
  }
  async function autoPack(): Promise<void> {
    if (!hasAuth('MesPacking:Auto')) return
    const rule = scopedRules.value.find((item) => item.id === selectedRuleId.value)
    if (!rule) {
      ElMessage.warning('当前租户尚未启用板材排包规则')
      return
    }
    if (boards.value.some((board) => !board.axis || board.thicknessMm <= 0)) {
      ElMessage.warning('请先维护板材的轴线和成品厚度')
      return
    }
    let preserveManual = true
    if (packs.value.length) {
      try {
        await confirm('保留人工调整包，仅对其余板材重新排包？', { title: '自动排包' })
      } catch {
        try {
          await confirm('清空现有排包结果并重新计算？人工调整也会丢失。', { title: '重新计算全部' })
        } catch {
          return
        }
        preserveManual = false
      }
    }
    const proposed = suggestPacks(boards.value, cloneDeep(packs.value), rule, preserveManual)
    packs.value = proposed
    selectedPack.value = null
    dirty.value = true
    if (remainingTotal.value)
      ElMessage.warning(`仍有 ${remainingTotal.value} 块未排包，请检查规则上限和板材数据`)
    else ElMessage.success('自动方案已生成，请核对后保存')
  }
  async function save(): Promise<void> {
    if (!selectedOrder.value || busy.value || !hasAuth('MesPacking:Save')) return
    const issue = validatePlan(boards.value, packs.value)
    if (issue) {
      ElMessage.warning(issue)
      return
    }
    busy.value = true
    try {
      await savePackingPlan(orderId.value, packs.value, revision.value)
      ElMessage.success('排包单已保存')
      await loadOrders()
      await loadDetails()
    } catch {
      /* API boundary displays the business error. */
    } finally {
      busy.value = false
    }
  }
  watch(
    effectiveTenantId,
    () => {
      orderId.value = ''
      boards.value = []
      packs.value = []
      void loadOrders()
    },
    { immediate: true }
  )
</script>

<style scoped lang="scss">
  .packing-page {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;
    min-height: 0;
  }

  .packing-page.is-focus-mode {
    gap: var(--art-space-2);
  }

  .packing-page__toolbar,
  .packing-page__pack-head,
  .packing-page__pack-meta,
  .packing-page__pack-fields {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-2);
    align-items: center;
  }

  .packing-page__content {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(276px, 316px) minmax(0, 1fr);
    gap: var(--art-space-3);
    min-width: 0;
    min-height: 0;
  }

  .packing-page__orders,
  .packing-page__main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .packing-page__orders :deep(.art-section-card__body) {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--art-space-3);
    min-height: 0;
  }

  .packing-page__filters,
  .packing-page__rule-field {
    display: grid;
    gap: var(--art-space-2);
    min-width: 0;
  }

  .packing-page__filters .el-date-editor,
  .packing-page__rule-field .el-select {
    width: 100%;
  }

  .packing-page__filters :deep(.el-date-editor) {
    width: 100% !important;
    min-width: 0;
    max-width: 100%;
  }

  .packing-page__rule-field {
    padding-top: var(--art-space-3);
    border-top: 1px solid var(--el-border-color-lighter);
  }

  .packing-page__rule-field > span {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-regular);
  }

  .packing-page__order-scroll {
    flex: 1;
    min-height: 180px;
  }

  .packing-page__order-list {
    display: grid;
    gap: 4px;
    padding-right: 8px;
  }

  .packing-page__order {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    background: var(--default-box-color);
    border: 1px solid transparent;
    border-radius: var(--art-control-radius);
  }

  .packing-page__order:hover {
    background: var(--art-gray-100);
  }

  .packing-page__order.is-selected {
    background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
    border-color: var(--theme-color);
  }

  .packing-page__order:focus-visible {
    outline: 2px solid var(--theme-color);
    outline-offset: 2px;
  }

  .packing-page__order-top,
  .packing-page__order-bottom {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    min-width: 0;
  }

  .packing-page__order-name {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    white-space: nowrap;
  }

  .packing-page__order-top strong {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--el-text-color-primary);
  }

  .packing-page__order-top > span,
  .packing-page__order-bottom {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .packing-page__order-bottom > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .packing-page__single-state {
    flex: none;
  }

  .packing-page__toolbar small,
  .packing-page__pack-meta {
    color: var(--el-text-color-secondary);
  }

  .packing-page__workspace {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;
    min-height: 0;
  }

  .packing-page.is-focus-mode .packing-page__content {
    min-height: 0;
  }

  .packing-page__panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .packing-page__panel :deep(.art-section-card__body) {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--art-space-3);
    min-height: 0;
  }

  .packing-page__toolbar {
    flex: none;
  }

  .packing-page__pack-list {
    display: grid;
    gap: var(--art-space-3);
    align-content: start;
    padding-right: 8px;
  }

  .packing-page__drop-hint {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    background: var(--art-gray-100);
    border-radius: var(--custom-radius);
  }

  .packing-page__pack {
    display: grid;
    gap: var(--art-space-2);
    min-width: 0;
    padding: var(--art-space-3);
    border: 1px solid var(--el-border-color-light);
    border-radius: var(--custom-radius);
  }

  .packing-page__pack--selected {
    border-color: var(--el-border-color-light);
  }

  .packing-page__pack--selected .packing-page__pack-select {
    color: var(--theme-color);
    background: var(--el-color-primary-light-9);
  }

  .packing-page__pack-head {
    justify-content: flex-start;
  }

  .packing-page__pack-head > :last-child {
    margin-left: auto;
  }

  .packing-page__pack-select {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 6px;
    color: var(--el-text-color-primary);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--art-control-radius);
  }

  .packing-page__pack-select:focus-visible {
    outline: 2px solid var(--theme-color);
    outline-offset: 2px;
  }

  .packing-page__pack-meta {
    gap: 4px 12px;
    font-size: 12px;
  }

  .packing-page__pack-fields {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
  }

  .packing-page__pack-fields > :first-child {
    width: 100%;
  }

  .packing-results {
    width: 100%;
    margin-inline: auto;

    .packing-page__pack {
      background: var(--default-box-color);
    }

    .packing-page__drop-hint {
      display: flex;
      gap: var(--art-space-2);
      align-items: center;
    }
  }

  .packing-page__drag {
    cursor: grab;
  }

  .packing-page__panel :deep(.packing-page__complete) {
    background: var(--el-color-warning-light-9);
  }

  @media (width <= 1100px) {
    .packing-page {
      height: auto;
      min-height: 100%;
    }

    .packing-page__content {
      grid-template-columns: minmax(0, 1fr);
    }

    .packing-page__orders {
      min-height: 320px;
    }

    .packing-page__panel {
      min-height: 360px;
    }
  }

  @media (width <= 680px) {
    .packing-page__pack-fields {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
