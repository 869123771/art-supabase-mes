<template>
  <div class="module-workbench art-full-height">
    <header>
      <span>MANUFACTURING EXECUTION SYSTEM</span>
      <h1>MES 制造执行</h1>
      <p>应用骨架已接入平台，后续可沿工艺、计划、执行和质量追溯逐步落地。</p>
    </header>

    <section class="readiness-strip" aria-label="MES 接入状态">
      <div
        ><ArtSvgIcon icon="ri:checkbox-circle-line" /><strong>独立子仓</strong
        ><span>已就绪</span></div
      >
      <div
        ><ArtSvgIcon icon="ri:checkbox-circle-line" /><strong>平台运行时</strong
        ><span>已接入</span></div
      >
      <div
        ><ArtSvgIcon icon="ri:checkbox-circle-line" /><strong>菜单与权限</strong
        ><span>已注册</span></div
      >
    </section>

    <section>
      <div class="section-heading">
        <div><span>IMPLEMENTATION MAP</span><h2>建议实施边界</h2></div>
        <el-tag effect="plain">架构准备阶段</el-tag>
      </div>
      <div class="capability-grid">
        <article v-for="item in capabilities" :key="item.title">
          <ArtSvgIcon :icon="item.icon" />
          <div
            ><h3>{{ item.title }}</h3
            ><p>{{ item.description }}</p></div
          >
        </article>
      </div>
    </section>

    <el-alert
      class="boundary-note"
      type="info"
      show-icon
      :closable="false"
      title="主数据归属约定"
      description="物料、设备、人员、工厂等统一身份归 MDM；工单、报工、在制品和质量过程归 MES。"
    />
  </div>
</template>

<script setup lang="ts">
  const capabilities = [
    { title: '工艺建模', description: '工艺路线、工序、配方与版本。', icon: 'ri:flow-chart' },
    {
      title: '生产计划',
      description: '生产订单、排程与资源约束。',
      icon: 'ri:calendar-schedule-line'
    },
    { title: '现场执行', description: '派工、开工、报工与完工。', icon: 'ri:play-list-add-line' },
    { title: '物料配送', description: '齐套、领退料与线边库存协同。', icon: 'ri:package-2-line' },
    { title: '质量过程', description: '检验、缺陷、不合格与处置。', icon: 'ri:shield-check-line' },
    { title: '生产追溯', description: '批次、序列号、设备与人员链路。', icon: 'ri:git-branch-line' }
  ]
</script>

<style scoped lang="scss">
  .module-workbench {
    padding: 28px;
    overflow: auto;
    color: var(--art-text-gray-900, #172033);
    background: var(--art-bg-color, #f5f7fa);

    header {
      max-width: 760px;
      margin-bottom: 22px;
      > span {
        color: var(--el-color-primary);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
      }
      h1 {
        margin: 5px 0 8px;
        font-size: 32px;
      }
      p {
        margin: 0;
        color: var(--art-text-gray-600, #667085);
        line-height: 1.7;
      }
    }
  }

  .readiness-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin-bottom: 28px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    border-left: 4px solid var(--el-color-success);
    border-radius: 10px;
    div {
      display: flex;
      gap: 9px;
      align-items: center;
      padding: 17px 20px;
    }
    div + div {
      border-left: 1px solid var(--el-border-color-lighter);
    }
    svg {
      color: var(--el-color-success);
      font-size: 19px;
    }
    span {
      margin-left: auto;
      color: var(--art-text-gray-600, #667085);
      font-size: 12px;
    }
  }

  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 14px;
    h2 {
      margin: 4px 0 0;
      font-size: 19px;
    }
    span {
      color: var(--el-color-primary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
  }

  .capability-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    article {
      display: flex;
      gap: 13px;
      min-height: 116px;
      padding: 20px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 10px;
      > svg {
        flex: 0 0 auto;
        color: var(--el-color-primary);
        font-size: 24px;
      }
      h3 {
        margin: 0 0 6px;
        font-size: 15px;
      }
      p {
        margin: 0;
        color: var(--art-text-gray-600, #667085);
        font-size: 13px;
        line-height: 1.6;
      }
    }
  }

  .boundary-note {
    margin-top: 18px;
  }

  @media (max-width: 800px) {
    .module-workbench {
      padding: 16px;
    }
    .readiness-strip,
    .capability-grid {
      grid-template-columns: 1fr;
    }
    .readiness-strip div + div {
      border-top: 1px solid var(--el-border-color-lighter);
      border-left: 0;
    }
  }
</style>
