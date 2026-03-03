const messages = {
  en: {
    app: {
      brand: 'AI Quant Tool',
      more: 'More',
      noData: '--'
    },
    tabs: {
      signals: 'Signals',
      proof: 'Proof',
      risk: 'Risk',
      velocity: 'Velocity'
    },
    common: {
      market: 'Market',
      status: 'Status',
      sort: 'Sort',
      range: 'Range',
      newest: 'Newest',
      confidence: 'Confidence',
      all: 'All',
      lastUpdated: 'Last updated',
      copied: 'Copied',
      close: 'Close',
      on: 'ON',
      off: 'OFF',
      usStocks: 'US Stocks',
      crypto: 'Crypto',
      time: 'Time',
      symbol: 'Symbol',
      side: 'Side',
      entryExit: 'Entry / Exit',
      pnl: 'PnL',
      fees: 'Fees'
    },
    status: {
      PENDING: 'Pending',
      TRIGGERED: 'Triggered',
      CLOSED: 'Closed',
      EXPIRED: 'Expired'
    },
    direction: {
      LONG: 'Long',
      SHORT: 'Short'
    },
    confidenceBand: {
      high: 'High',
      medium: 'Medium',
      low: 'Low'
    },
    validity: {
      '24H': '24H',
      UNTIL_TRIGGERED: 'Until Triggered'
    },
    signals: {
      confShort: 'Conf',
      watchlistToggle: 'Toggle watchlist',
      noSignals: 'No {status} signals in {market}.',
      backToSignals: 'Back to Signals',
      detailTitle: 'Signal Detail',
      entryZone: 'Entry zone',
      stopLoss: 'Stop loss',
      takeProfit: 'Take profit',
      positionSize: 'Position size',
      positionSizeValue: '{value}% of equity',
      validity: 'Validity / TIF',
      modelVersion: 'Model version',
      signalId: 'Signal ID',
      rationale: 'Rationale',
      copyParams: 'Copy order params',
      shareLink: 'Share link',
      shareTitle: 'Signal {symbol}'
    },
    proof: {
      winRate: 'Win Rate',
      avgRR: 'Avg R:R',
      maxDD: 'Max DD',
      totalReturn: 'Total Return',
      backtestVsLive: 'Backtest vs Live / Paper',
      methodology: 'Methodology',
      fees: 'Fees',
      slippage: 'Slippage',
      funding: 'Funding',
      leverage: 'Leverage',
      recentTrades: 'Recent Trades',
      downloadCsv: 'Download CSV',
      downloadPdf: 'Download PDF',
      chartBacktest: 'Backtest',
      chartLive: 'Live / Paper',
      paperTimeline: 'Paper Trading Status Timeline',
      paperTimelineSub: 'Execution sync and control actions for trust and auditability.'
    },
    paperStatus: {
      SYNCED: 'Synced',
      RUNNING: 'Running',
      DERISKED: 'De-risked',
      PAUSED: 'Paused',
      RECOVERED: 'Recovered'
    },
    risk: {
      rules: 'Risk Rules',
      perTrade: 'Per-trade risk limit',
      perTradeValue: 'Max {value}% loss per trade',
      dailyLoss: 'Daily loss limit',
      dailyLossValue: 'Stop trading at {value}%',
      maxDD: 'Max drawdown limit',
      maxDDValue: 'Pause/reduce at {value}%',
      volSwitch: 'Volatility switch',
      status: 'Risk Status',
      tradingToday: 'Trading status today',
      currentLevel: 'Current risk level',
      lastEvent: 'Last event',
      level: {
        LOW: 'Low',
        MEDIUM: 'Medium',
        HIGH: 'High'
      }
    },
    velocity: {
      current: 'Current Velocity',
      percentile: 'Percentile',
      similarStats: 'Similar Event Stats',
      events: 'Events',
      upProb: 'Next 7D Up Prob.',
      avgMove: 'Avg Move',
      avgDD: 'Avg Drawdown',
      howUsed: 'How We Use It',
      regime: {
        RISK_ON: 'Risk-On',
        NEUTRAL: 'Neutral',
        RISK_OFF: 'Risk-Off'
      }
    },
    about: {
      title: 'About & Compliance',
      team: 'Team',
      appVersion: 'App Version',
      dataUpdated: 'Data Last Updated',
      disclaimer:
        'This is a signal & execution tool, not asset management. Funds remain in the user\'s own brokerage/exchange account (non-custodial).'
    }
  },
  zh: {
    app: {
      brand: 'AI 量化工具',
      more: '更多',
      noData: '--'
    },
    tabs: {
      signals: '信号',
      proof: '验证',
      risk: '风控',
      velocity: '速度'
    },
    common: {
      market: '市场',
      status: '状态',
      sort: '排序',
      range: '区间',
      newest: '最新',
      confidence: '置信度',
      all: '全部',
      lastUpdated: '更新时间',
      copied: '已复制',
      close: '关闭',
      on: '开启',
      off: '关闭',
      usStocks: '美股',
      crypto: '加密',
      time: '时间',
      symbol: '标的',
      side: '方向',
      entryExit: '开仓 / 平仓',
      pnl: '收益',
      fees: '费用'
    },
    status: {
      PENDING: '待触发',
      TRIGGERED: '已触发',
      CLOSED: '已平仓',
      EXPIRED: '已过期'
    },
    direction: {
      LONG: '做多',
      SHORT: '做空'
    },
    confidenceBand: {
      high: '高',
      medium: '中',
      low: '低'
    },
    validity: {
      '24H': '24小时',
      UNTIL_TRIGGERED: '直到触发'
    },
    signals: {
      confShort: '置信',
      watchlistToggle: '切换自选',
      noSignals: '{market}暂无{status}信号。',
      backToSignals: '返回信号列表',
      detailTitle: '信号详情',
      entryZone: '入场区间',
      stopLoss: '止损',
      takeProfit: '止盈',
      positionSize: '建议仓位',
      positionSizeValue: '权益的 {value}%',
      validity: '有效期 / TIF',
      modelVersion: '模型版本',
      signalId: '信号 ID',
      rationale: '策略理由',
      copyParams: '复制下单参数',
      shareLink: '分享链接',
      shareTitle: '信号 {symbol}'
    },
    proof: {
      winRate: '胜率',
      avgRR: '平均盈亏比',
      maxDD: '最大回撤',
      totalReturn: '总收益',
      backtestVsLive: '回测 vs 实盘/模拟',
      methodology: '方法假设',
      fees: '手续费',
      slippage: '滑点',
      funding: '资金费率',
      leverage: '杠杆',
      recentTrades: '近期交易',
      downloadCsv: '下载 CSV',
      downloadPdf: '下载 PDF',
      chartBacktest: '回测',
      chartLive: '实盘/模拟',
      paperTimeline: '模拟盘状态时间线',
      paperTimelineSub: '展示执行同步和风控动作，增强可审计性。'
    },
    paperStatus: {
      SYNCED: '已同步',
      RUNNING: '运行中',
      DERISKED: '已降风险',
      PAUSED: '已暂停',
      RECOVERED: '已恢复'
    },
    risk: {
      rules: '风控规则',
      perTrade: '单笔风险上限',
      perTradeValue: '单笔最大亏损 {value}%',
      dailyLoss: '日内亏损上限',
      dailyLossValue: '达到 {value}% 停止交易',
      maxDD: '回撤上限',
      maxDDValue: '达到 {value}% 降仓或暂停',
      volSwitch: '波动开关',
      status: '风控状态',
      tradingToday: '今日交易状态',
      currentLevel: '当前风险级别',
      lastEvent: '最近事件',
      level: {
        LOW: '低',
        MEDIUM: '中',
        HIGH: '高'
      }
    },
    velocity: {
      current: '当前速度值',
      percentile: '历史分位',
      similarStats: '相似事件统计',
      events: '事件数',
      upProb: '未来7天上涨概率',
      avgMove: '平均涨跌幅',
      avgDD: '平均回撤',
      howUsed: '如何使用',
      regime: {
        RISK_ON: '偏风险',
        NEUTRAL: '中性',
        RISK_OFF: '避险'
      }
    },
    about: {
      title: '关于与合规',
      team: '团队',
      appVersion: '应用版本',
      dataUpdated: '数据更新时间',
      disclaimer:
        '本工具为信号与执行辅助，不属于资产管理。资金始终保留在用户本人券商/交易所账户（非托管）。'
    }
  }
};

function getByPath(obj, path) {
  return path.split('.').reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part];
    }
    return undefined;
  }, obj);
}

function applyVars(template, vars) {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template
  );
}

export function createTranslator(lang = 'en') {
  const pack = messages[lang] ?? messages.en;

  return (key, vars, fallback = '') => {
    const value = getByPath(pack, key) ?? getByPath(messages.en, key);
    if (typeof value !== 'string') {
      return fallback || key;
    }
    return applyVars(value, vars);
  };
}

export function getLocale(lang) {
  return lang === 'zh' ? 'zh-CN' : 'en-US';
}

export function getDefaultLang() {
  if (typeof window === 'undefined') return 'en';
  return window.navigator.language?.toLowerCase().includes('zh') ? 'zh' : 'en';
}
