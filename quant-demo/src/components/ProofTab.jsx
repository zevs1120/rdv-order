import { useMemo, useState } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import SegmentedControl from './SegmentedControl';
import KpiCard from './KpiCard';
import Skeleton from './Skeleton';
import { downloadCsv } from '../utils/downloads';
import { formatDateTime, formatNumber, formatPercent } from '../utils/format';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

export default function ProofTab({ market, setMarket, performance, trades, loading, t, lang, locale }) {
  const [range, setRange] = useState('3M');
  const [showAssumptions, setShowAssumptions] = useState(false);

  const currentRecord = useMemo(
    () => performance.records?.find((item) => item.market === market && item.range === range),
    [performance, market, range]
  );

  const marketTrades = useMemo(() => trades.filter((item) => item.market === market).slice(0, 14), [trades, market]);

  const paperTimeline = useMemo(
    () => (performance.paper_timeline ?? []).filter((item) => item.market === market).slice(0, 6),
    [performance, market]
  );

  const chartData = useMemo(() => {
    if (!currentRecord) return null;

    return {
      labels: currentRecord.equity_curve.dates,
      datasets: [
        {
          label: t('proof.chartBacktest'),
          data: currentRecord.equity_curve.backtest,
          borderColor: '#5be7c4',
          backgroundColor: 'rgba(91, 231, 196, 0.15)',
          tension: 0.35,
          pointRadius: 0,
          fill: false
        },
        {
          label: t('proof.chartLive'),
          data: currentRecord.equity_curve.live,
          borderColor: '#7aa7ff',
          backgroundColor: 'rgba(122, 167, 255, 0.15)',
          tension: 0.35,
          pointRadius: 0,
          fill: false
        }
      ]
    };
  }, [currentRecord, t]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#ccd5f6'
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#8c95b5',
          maxTicksLimit: 6
        },
        grid: {
          color: 'rgba(140,149,181,0.12)'
        }
      },
      y: {
        ticks: {
          color: '#8c95b5'
        },
        grid: {
          color: 'rgba(140,149,181,0.12)'
        }
      }
    }
  };

  const downloadLabel = `${market.toLowerCase()}-trades-${range.toLowerCase()}.csv`;

  return (
    <section className="stack-gap">
      <SegmentedControl
        label={t('common.market')}
        options={[
          { label: t('common.usStocks'), value: 'US' },
          { label: t('common.crypto'), value: 'CRYPTO' }
        ]}
        value={market}
        onChange={setMarket}
      />

      <SegmentedControl
        label={t('common.range')}
        options={[
          { label: '3M', value: '3M' },
          { label: t('common.all'), value: 'ALL' }
        ]}
        value={range}
        onChange={setRange}
        compact
      />

      {loading || !currentRecord ? (
        <>
          <Skeleton lines={4} />
          <Skeleton lines={6} />
        </>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label={t('proof.winRate')} value={formatPercent(currentRecord.kpis.win_rate)} />
            <KpiCard label={t('proof.avgRR')} value={currentRecord.kpis.avg_rr.toFixed(2)} />
            <KpiCard label={t('proof.maxDD')} value={formatPercent(currentRecord.kpis.max_dd)} />
            <KpiCard label={t('proof.totalReturn')} value={formatPercent(currentRecord.kpis.total_return)} />
          </div>

          <article className="glass-card">
            <div className="card-header">
              <h3 className="card-title">{t('proof.backtestVsLive')}</h3>
              <button type="button" className="info-btn" onClick={() => setShowAssumptions((prev) => !prev)}>
                {t('proof.methodology')}
              </button>
            </div>

            {showAssumptions ? (
              <div className="method-box">
                <p>
                  {t('proof.fees')}: {currentRecord.assumptions.fees_bps} bps
                </p>
                <p>
                  {t('proof.slippage')}: {currentRecord.assumptions.slippage_bps} bps
                </p>
                <p>
                  {t('proof.funding')}: {currentRecord.assumptions.funding}
                </p>
                <p>
                  {t('proof.leverage')}: {currentRecord.assumptions.leverage}
                </p>
              </div>
            ) : null}

            <div className="chart-wrap">{chartData ? <Line data={chartData} options={chartOptions} /> : null}</div>
          </article>

          <article className="glass-card">
            <div className="card-header">
              <h3 className="card-title">{t('proof.paperTimeline')}</h3>
            </div>
            <p className="muted timeline-sub">{t('proof.paperTimelineSub')}</p>
            <div className="timeline-list">
              {paperTimeline.map((event) => (
                <div className="timeline-item" key={`${event.time}-${event.status}`}>
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <div className="timeline-head">
                      <span className="timeline-time">{formatDateTime(event.time, locale)}</span>
                      <span className={`badge badge-${event.status.toLowerCase()}`}>
                        {t(`paperStatus.${event.status}`, undefined, event.status)}
                      </span>
                    </div>
                    <p className="muted timeline-note">{lang === 'zh' ? event.note_zh : event.note_en}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-card">
            <div className="card-header">
              <h3 className="card-title">{t('proof.recentTrades')}</h3>
              <div className="download-row">
                <button type="button" className="pill-btn active" onClick={() => downloadCsv(downloadLabel, marketTrades)}>
                  {t('proof.downloadCsv')}
                </button>
                <a className="pill-btn" href="/mock/performance-report.pdf" download>
                  {t('proof.downloadPdf')}
                </a>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('common.time')}</th>
                    <th>{t('common.symbol')}</th>
                    <th>{t('common.side')}</th>
                    <th>{t('common.entryExit')}</th>
                    <th>{t('common.pnl')}</th>
                    <th>{t('common.fees')}</th>
                  </tr>
                </thead>
                <tbody>
                  {marketTrades.map((trade) => (
                    <tr key={`${trade.signal_id}-${trade.time_in}`}>
                      <td>{formatDateTime(trade.time_out, locale)}</td>
                      <td>{trade.symbol}</td>
                      <td>{t(`direction.${trade.side}`, undefined, trade.side)}</td>
                      <td>
                        {formatNumber(trade.entry, 2, locale)} / {formatNumber(trade.exit, 2, locale)}
                      </td>
                      <td className={trade.pnl_pct >= 0 ? 'positive' : 'negative'}>
                        {trade.pnl_pct > 0 ? '+' : ''}
                        {trade.pnl_pct.toFixed(2)}%
                      </td>
                      <td>${formatNumber(trade.fees, 2, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
