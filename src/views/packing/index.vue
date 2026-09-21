<template>
  <ArtPermissionGuard permission="MesPacking:View" resource-name="排包单">
    <div class="packing-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
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

      <ArtSectionCard
        title="工单与排包规则"
        subtitle="先选择生产工单；系统按成品类型预选规则，可在生成前切换。"
        :loading="loading"
        :error="error"
        :empty="!loading && !error && !orders.length"
        empty-title="暂无可排包工单"
        empty-description="请先在生产工单中建立未关闭的工单。"
        @retry="loadOrders"
      >
        <div class="packing-page__selector">
          <div class="packing-page__field">
            <span>生产工单</span>
            <ElSelect
              v-model="orderId"
              filterable
              clearable
              placeholder="搜索工单号或成品名称"
              aria-label="选择生产工单"
              @change="selectOrder"
            >
              <ElOption
                v-for="order in orders"
                :key="order.id"
                :label="`${order.workOrderNo} · ${order.materialNameSnapshot}`"
                :value="order.id"
              />
            </ElSelect>
          </div>
          <div class="packing-page__field">
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
          <div v-if="selectedOrder" class="packing-page__order-meta">
            <strong>{{ selectedOrder.materialNameSnapshot }}</strong>
            <span>工单数量 {{ selectedOrder.orderQuantity }}</span>
            <ElTag v-if="dirty" type="warning" effect="plain">有未保存调整</ElTag>
          </div>
        </div>
      </ArtSectionCard>

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
          :subtitle="`剩余 ${remainingTotal} 块 · 双击明细可加入选中包，也可拖入右侧`"
          :loading="detailLoading"
          :error="detailError"
          :empty="!detailLoading && !detailError && !boards.length"
          empty-title="工单尚无板材明细"
          empty-description="先登记成品板的区域、轴线、尺寸和块数。"
          @retry="loadDetails"
        >
          <template #actions>
            <ElButton v-auth="'MesWorkOrder:Edit'" @click="openWorkOrder">维护工单明细</ElButton>
          </template>
          <div class="packing-page__toolbar">
            <ElButton
              v-auth="'MesPacking:Manual'"
              :disabled="!selectedBoards.length"
              @click="createPack"
              >选中板材新建包</ElButton
            >
            <ElButton
              v-auth="'MesPacking:Manual'"
              :disabled="!selectedBoards.length || !selectedPack"
              @click="mergeSelected"
              >合并到选中包</ElButton
            >
            <small>全部排完后显示浅黄色；修改已排包板材前请先拆包并保存。</small>
          </div>
          <ElTable
            ref="boardTableRef"
            :data="boards"
            :row-class-name="boardRowClass"
            height="100%"
            row-key="id"
            @selection-change="selectedBoards = $event"
            @row-dblclick="addBoard"
          >
            <ElTableColumn type="selection" width="40" />
            <ElTableColumn label="区域 / 轴线" min-width="88" show-overflow-tooltip>
              <template #default="{ row }">{{ row.area }} / {{ row.axis || '待维护' }}</template>
            </ElTableColumn>
            <ElTableColumn label="编号" min-width="76" show-overflow-tooltip>
              <template #default="{ row }">
                <span
                  :draggable="canManual"
                  class="packing-page__drag"
                  title="拖入右侧包"
                  @dragstart="dragBoard($event, row.id)"
                  >{{ row.boardNo }}</span
                >
              </template>
            </ElTableColumn>
            <ElTableColumn label="尺寸mm" width="100" align="right">
              <template #default="{ row }">{{ row.lengthMm }}×{{ row.widthMm }}</template>
            </ElTableColumn>
            <ElTableColumn label="已排/总" width="72" align="right">
              <template #default="{ row }">{{ packedForRow(row) }} / {{ row.pieces }}</template>
            </ElTableColumn>
            <ElTableColumn label="面积㎡" width="64" align="right">
              <template #default="{ row }">{{ areaForRow(row).toFixed(2) }}</template>
            </ElTableColumn>
            <ElTableColumn label="参数" width="60" fixed="right">
              <template #default="{ row }">
                <ElButton v-auth="'MesPacking:Spec'" link type="primary" @click="openSpec(row)"
                  >维护</ElButton
                >
              </template>
            </ElTableColumn>
          </ElTable>
        </ArtSectionCard>

        <ArtSectionCard
          class="packing-page__panel"
          title="排包结果"
          :subtitle="`${packs.length} 包 · ${packedTotal} 块 · 选择包后可合并或拆包`"
          :loading="detailLoading"
          :error="detailError"
          :empty="!detailLoading && !detailError && !packs.length"
          empty-title="尚未排包"
          empty-description="可从左侧选中板材新建包，或生成自动推荐方案。"
          @retry="loadDetails"
        >
          <template #actions>
            <ElButton v-auth="'MesPacking:Manual'" :disabled="!selectedPack" @click="splitPack"
              >拆包</ElButton
            >
          </template>
          <template #empty-action>
            <ElButton v-auth="'MesPacking:Auto'" type="primary" @click="autoPack">
              自动生成推荐方案
            </ElButton>
          </template>
          <div
            class="packing-page__packs"
            aria-label="排包列表"
            @dragover.prevent
            @drop="dropToUnpacked"
          >
            <div class="packing-page__drop-hint">将包内板材拖到此处移出，返回待打包区</div>
            <div
              v-for="pack in packs"
              :key="pack.id || pack.packNo"
              class="packing-page__pack"
              :class="{ 'packing-page__pack--selected': selectedPack === pack }"
              @dragover.prevent
              @drop.stop="dropToPack($event, pack)"
            >
              <div class="packing-page__pack-head">
                <button
                  type="button"
                  class="packing-page__pack-select"
                  :aria-label="`选择包 ${pack.packNo}`"
                  @click="selectedPack = pack"
                >
                  <strong>{{ pack.packNo }}</strong>
                  <ElTag v-if="pack.manuallyAdjusted" type="warning" size="small" effect="plain"
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
                <span>延米 {{ (packTotals(pack, boards).lengthMm / 1000).toFixed(2) }} m</span>
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
              <ElTable :data="pack.items" size="small" table-layout="fixed">
                <ElTableColumn label="编号" min-width="90">
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
                <ElTableColumn label="尺寸" min-width="110">
                  <template #default="{ row: item }"
                    >{{ boardById(item.boardId)?.lengthMm }} ×
                    {{ boardById(item.boardId)?.widthMm }}</template
                  >
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
                <ElTableColumn label="延米 m" width="70" align="right">
                  <template #default="{ row: item }">{{
                    itemMeters(item.boardId, item.pieces).toFixed(2)
                  }}</template>
                </ElTableColumn>
                <ElTableColumn label="面积 ㎡" width="70" align="right">
                  <template #default="{ row: item }">{{
                    itemArea(item.boardId, item.pieces).toFixed(2)
                  }}</template>
                </ElTableColumn>
                <ElTableColumn label="移出" width="52">
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
              </ElTable>
            </div>
          </div>
        </ArtSectionCard>
      </div>
      <ArtSectionCard
        v-else
        class="business-workspace-content"
        title="开始排包"
        empty
        empty-title="请选择生产工单"
        empty-description="系统已加载未关闭的生产工单，选中一单后登记板材或继续排包。"
      />
      <PackingBoardSpecDialog ref="specDialogRef" @success="loadDetails" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import { storeToRefs } from 'pinia'
  import { useRouter } from 'vue-router'
  import type { TableInstance } from 'element-plus'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
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
  const { confirm } = useArtFeedback()
  const { hasAuth } = useAuth()
  const canManual = computed(() => hasAuth('MesPacking:Manual'))
  const orders = ref<Order[]>([])
  const rules = ref<PackRule[]>([])
  const selectedRuleId = ref('')
  const orderId = ref('')
  const boards = ref<WorkOrderBoard[]>([])
  const packs = ref<PackDraft[]>([])
  const selectedBoards = ref<WorkOrderBoard[]>([])
  const selectedPack = shallowRef<PackDraft | null>(null)
  const boardTableRef = ref<TableInstance>()
  const specDialogRef = ref<{ handleOpen: (row: WorkOrderBoard) => Promise<void> }>()
  const loading = ref(false)
  const detailLoading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const detailError = ref('')
  const dirty = ref(false)
  const revision = ref('')
  const selectedOrder = computed(() => orders.value.find((order) => order.id === orderId.value))
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
      packNo: `PK-${String(packs.value.length + 1).padStart(4, '0')}`,
      manuallyAdjusted: true,
      confirmed: false,
      remark: '',
      items: []
    }
    while (packs.value.some((item) => item.packNo === pack.packNo)) pack.packNo += 'A'
    packs.value.push(pack)
    const addedPack = packs.value[packs.value.length - 1]
    rows.forEach((row) => addPieces(row, addedPack))
    selectedPack.value = addedPack
    boardTableRef.value?.clearSelection()
  }
  function mergeSelected(): void {
    if (!canManual.value) return
    if (!selectedPack.value) return
    selectedBoards.value.forEach((board) => addPieces(board, selectedPack.value!))
    boardTableRef.value?.clearSelection()
  }
  function addBoard(row: WorkOrderBoard): void {
    if (selectedPack.value) addPieces(row, selectedPack.value)
    else {
      selectedBoards.value = [row]
      createPack()
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
  function splitPack(): void {
    if (!canManual.value) return
    if (!selectedPack.value) return
    packs.value = packs.value.filter((pack) => pack !== selectedPack.value)
    selectedPack.value = null
    dirty.value = true
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
  .packing-page__toolbar,
  .packing-page__pack-head,
  .packing-page__pack-meta,
  .packing-page__pack-fields {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--art-space-2);
  }
  .packing-page__selector {
    display: grid;
    grid-template-columns: minmax(240px, 440px) minmax(200px, 260px) minmax(0, 1fr);
    gap: var(--art-space-3);
    align-items: end;
    min-width: 0;
  }

  .packing-page__field {
    display: grid;
    gap: var(--art-space-2);
    min-width: 0;
  }

  .packing-page__field > span {
    color: var(--el-text-color-regular);
    font-size: 12px;
    font-weight: 600;
  }

  .packing-page__field .el-select {
    width: 100%;
  }

  .packing-page__order-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px var(--art-space-2);
    align-items: center;
    min-width: 0;
    min-height: 32px;
    font-size: 12px;
  }

  .packing-page__order-meta strong {
    color: var(--el-text-color-primary);
    font-weight: 600;
  }

  .packing-page__single-state {
    flex: none;
  }
  .packing-page__order-meta,
  .packing-page__toolbar small,
  .packing-page__pack-meta {
    color: var(--el-text-color-secondary);
  }
  .packing-page__workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    flex: 1;
    gap: var(--art-space-3);
    min-height: 0;
    min-width: 0;
  }
  .packing-page__panel {
    display: flex;
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
  .packing-page__packs {
    display: grid;
    gap: var(--art-space-3);
    overflow: auto;
    min-height: 0;
    align-content: start;
  }
  .packing-page__drop-hint {
    padding: 8px 12px;
    color: var(--el-text-color-secondary);
    background: var(--art-gray-100);
    border-radius: var(--custom-radius);
    font-size: 12px;
  }
  .packing-page__pack {
    display: grid;
    gap: var(--art-space-2);
    padding: var(--art-space-3);
    border: 1px solid var(--el-border-color-light);
    border-radius: var(--custom-radius);
    min-width: 0;
  }
  .packing-page__pack--selected {
    border-color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color));
  }
  .packing-page__pack-head {
    justify-content: space-between;
  }
  .packing-page__pack-select {
    display: flex;
    align-items: center;
    gap: 8px;
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
    flex-wrap: nowrap;
  }
  .packing-page__pack-fields > :first-child {
    width: 150px;
    flex: none;
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

    .packing-page__selector {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .packing-page__order-meta {
      grid-column: 1 / -1;
    }

    .packing-page__workspace {
      grid-template-columns: minmax(0, 1fr);
      flex: none;
      overflow: visible;
    }
    .packing-page__panel {
      min-height: 440px;
    }
  }
  @media (width <= 680px) {
    .packing-page__selector {
      grid-template-columns: minmax(0, 1fr);
    }
    .packing-page__order-meta {
      grid-column: auto;
    }
    .packing-page__pack-fields {
      flex-wrap: wrap;
    }
  }
</style>
