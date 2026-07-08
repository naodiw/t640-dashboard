(() => {
  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxghsmRB0sMZ4ooEBECytx3lbiFicwEvlMkSTcLzIUPhqoytcMhJQnu7uajKwHg_iim/exec';
  const API_URL = window.T640_DASHBOARD_API || DEFAULT_API_URL;
  const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const state = {
    days: 7,
    resolution: 'auto',
    heatmapMode: 'week',
    data: null
  };
  const charts = {};

  const el = {};

  window.addEventListener('DOMContentLoaded', () => {
    bindElements();
    bindControls();
    initCharts();
    refreshIcons();
    loadDashboard();
    window.addEventListener('resize', debounce(resizeCharts, 150));
  });

  function bindElements() {
    [
      'liveStatus', 'refreshButton', 'rangeControl', 'resolutionSelect', 'pm25Card', 'pm10Card',
      'warningCard', 'pm25Value', 'pm10Value', 'tempValue', 'pressureValue',
      'warningValue', 'pm25Meta', 'pm10Meta', 'tempMeta', 'pressureMeta',
      'lastSeenMeta', 'pointCount', 'warningList', 'heatmapModeControl', 'heatmapSubtitle',
      'heatmapTitle'
    ].forEach((id) => {
      el[id] = document.getElementById(id);
    });
  }

  function bindControls() {
    el.rangeControl.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-days]');
      if (!button) return;
      state.days = Number(button.dataset.days);
      [...el.rangeControl.querySelectorAll('button')].forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      loadDashboard();
    });

    el.resolutionSelect.addEventListener('change', () => {
      state.resolution = el.resolutionSelect.value;
      loadDashboard();
    });

    el.refreshButton.addEventListener('click', () => loadDashboard());

    el.heatmapModeControl.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-mode]');
      if (!button) return;
      state.heatmapMode = button.dataset.mode;
      [...el.heatmapModeControl.querySelectorAll('button')].forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      if (state.heatmapMode === 'month' && state.days < 30) {
        setRangeDays(30);
        return;
      }
      if (state.heatmapMode === 'year' && state.days < 365) {
        setRangeDays(365);
        return;
      }
      renderHeatmap(state.data?.rows || []);
    });
  }

  function setRangeDays(days) {
    state.days = days;
    [...el.rangeControl.querySelectorAll('button')].forEach((item) => {
      item.classList.toggle('active', Number(item.dataset.days) === days);
    });
    loadDashboard();
  }

  function initCharts() {
    charts.pm = echarts.init(document.getElementById('pmChart'));
    charts.rolling = echarts.init(document.getElementById('rollingChart'));
    charts.env = echarts.init(document.getElementById('envChart'));
    charts.heatmap = echarts.init(document.getElementById('heatmapChart'));
  }

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  async function loadDashboard() {
    setLoading(true);
    clearError();
    try {
      const data = await fetchJsonp({
        dashboard: '1',
        days: String(state.days),
        resolution: state.resolution
      });
      if (!data || data.status !== 'ok') {
        throw new Error(data && data.message ? data.message : 'Dashboard API error');
      }
      state.data = data;
      renderDashboard(data);
    } catch (error) {
      showError(error.message || String(error));
    } finally {
      setLoading(false);
    }
  }

  function fetchJsonp(params) {
    return new Promise((resolve, reject) => {
      const callbackName = `t640Dashboard_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = new URL(API_URL);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
      url.searchParams.set('callback', callbackName);
      url.searchParams.set('_', String(Date.now()));

      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Dashboard API timeout'));
      }, 25000);

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('Dashboard API request failed'));
      };

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      }

      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  function renderDashboard(data) {
    const latest = data.latest || {};
    const rows = Array.isArray(data.rows) ? data.rows : [];

    renderStatus(latest);
    renderMetrics(data, latest);
    renderCharts(rows, data);
    renderWarnings(rows);
  }

  function renderStatus(latest) {
    el.liveStatus.classList.remove('status-live', 'status-stale', 'status-muted');
    if (!latest.ts) {
      el.liveStatus.textContent = 'NO DATA';
      el.liveStatus.classList.add('status-muted');
      return;
    }
    if (latest.stale) {
      el.liveStatus.textContent = `STALE ${latest.ageMinutes}m`;
      el.liveStatus.classList.add('status-stale');
      return;
    }
    el.liveStatus.textContent = `LIVE ${latest.ageMinutes}m`;
    el.liveStatus.classList.add('status-live');
  }

  function renderMetrics(data, latest) {
    const summary = data.summary || {};
    setMetric(el.pm25Value, latest.pm25, 1);
    setMetric(el.pm10Value, latest.pm10, 1);
    setMetric(el.tempValue, latest.temp, 1);
    setMetric(el.pressureValue, latest.pressure, 1);
    el.warningValue.textContent = latest.warnings || '--';

    el.pm25Meta.textContent = metricTimeMeta(latest.pm25TsLabel || latest.updatedLabel, summary.pm25);
    el.pm10Meta.textContent = metricTimeMeta(latest.pm10TsLabel || latest.updatedLabel, summary.pm10);
    el.tempMeta.textContent = summary.temp && summary.temp.avg != null ? `Range avg ${formatNumber(summary.temp.avg, 1)}` : 'Outdoor sensor';
    el.pressureMeta.textContent = latest.updatedLabel ? `Data ${latest.updatedLabel}` : 'Barometric';
    el.lastSeenMeta.textContent = latest.updatedLabel ? `Updated ${latest.updatedLabel}` : (latest.label ? `Hour ${latest.label}` : '--');
    el.pointCount.textContent = `${rowsLabel(data.summary && data.summary.count)} points`;

    applyLevel(el.pm25Card, levelForPm25(latest.pm25));
    applyLevel(el.pm10Card, levelForPm10(latest.pm10));
    applyLevel(el.warningCard, latest.warnings && latest.warnings !== 'OK' ? 'high' : 'good');
  }

  function renderCharts(rows, data) {
    renderPmChart(rows);
    renderRollingChart(rows);
    renderEnvChart(rows);
    renderHeatmap(rows);
    resizeCharts();
  }

  function renderPmChart(rows) {
    charts.pm.setOption(baseLineOption({
      legend: ['PM2.5', 'PM10'],
      yName: 'ug/m3',
      series: [
        lineSeries('PM2.5', rows, 'pm25', '#16a36f'),
        lineSeries('PM10', rows, 'pm10', '#3f6fb5')
      ],
      markLines: [
        { yAxis: 15, name: '15' },
        { yAxis: 37.5, name: '37.5' }
      ]
    }), true);
  }

  function renderRollingChart(rows) {
    charts.rolling.setOption(baseLineOption({
      legend: ['PM2.5 24h', 'PM10 24h'],
      yName: 'ug/m3',
      series: [
        lineSeries('PM2.5 24h', rows, 'pm25_24h', '#df6a2e'),
        lineSeries('PM10 24h', rows, 'pm10_24h', '#20262f')
      ]
    }), true);
  }

  function renderEnvChart(rows) {
    charts.env.setOption({
      color: ['#c93b3b', '#3f6fb5'],
      animationDuration: 450,
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value) => formatNumber(value, 1)
      },
      legend: {
        top: 0,
        data: ['Temp', 'Pressure']
      },
      grid: {
        top: 44,
        right: 48,
        bottom: 42,
        left: 48
      },
      xAxis: {
        type: 'time',
        axisLabel: { formatter: formatAxisTime }
      },
      yAxis: [
        {
          type: 'value',
          name: 'deg C',
          scale: true,
          splitLine: { lineStyle: { color: '#e6ebef' } }
        },
        {
          type: 'value',
          name: 'mmHg',
          scale: true,
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: 'Temp',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          smooth: true,
          data: rows.map((row) => [row.ts, row.temp])
        },
        {
          name: 'Pressure',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          smooth: true,
          data: rows.map((row) => [row.ts, row.pressure])
        }
      ]
    }, true);
  }

  function renderHeatmap(rows) {
    const mode = state.heatmapMode;
    const heat = mode === 'year' ? buildYearHeatmap(rows) : mode === 'month' ? buildMonthHeatmap(rows) : buildWeekHeatmap(rows);
    const heatmapNode = document.getElementById('heatmapChart');
    heatmapNode.style.height = mode === 'month' ? '620px' : mode === 'year' ? '460px' : '350px';
    el.heatmapSubtitle.textContent = heat.subtitle;
    el.heatmapTitle.textContent = heat.title;
    charts.heatmap.setOption({
      animationDuration: 450,
      tooltip: {
        position: 'top',
        formatter: heat.tooltip
      },
      grid: {
        top: 18,
        right: 18,
        bottom: 72,
        left: mode === 'month' ? 70 : 54
      },
      xAxis: {
        type: 'category',
        data: heat.xLabels,
        splitArea: { show: true },
        axisLabel: { interval: heat.xInterval }
      },
      yAxis: {
        type: 'category',
        data: heat.yLabels,
        splitArea: { show: true }
      },
      visualMap: {
        min: 0,
        max: Math.max(40, Math.ceil(heat.max || 40)),
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 12,
        inRange: {
          color: ['#d8f1e7', '#f4d35e', '#ee964b', '#c93b3b']
        }
      },
      series: [{
        name: 'PM2.5',
        type: 'heatmap',
        data: heat.data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(24, 32, 42, 0.22)'
          }
        }
      }]
    }, true);
    charts.heatmap.resize();
  }

  function baseLineOption({ legend, yName, series, markLines = [] }) {
    const decoratedSeries = series.map((item) => {
      if (!markLines.length || item.name !== 'PM2.5') return item;
      return {
        ...item,
        markLine: {
          silent: true,
          symbol: 'none',
          label: { color: '#64717f' },
          lineStyle: { color: '#aeb7c2', type: 'dashed' },
          data: markLines
        }
      };
    });
    return {
      animationDuration: 450,
      color: decoratedSeries.map((item) => item.lineStyle.color),
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value) => formatNumber(value, 2)
      },
      legend: {
        top: 0,
        data: legend
      },
      grid: {
        top: 44,
        right: 22,
        bottom: 42,
        left: 50
      },
      xAxis: {
        type: 'time',
        axisLabel: { formatter: formatAxisTime }
      },
      yAxis: {
        type: 'value',
        name: yName,
        min: 0,
        splitLine: { lineStyle: { color: '#e6ebef' } }
      },
      series: decoratedSeries
    };
  }

  function lineSeries(name, rows, key, color) {
    return {
      name,
      type: 'line',
      showSymbol: false,
      smooth: true,
      connectNulls: false,
      lineStyle: {
        width: 2.5,
        color
      },
      areaStyle: {
        opacity: 0.08,
        color
      },
      data: rows.map((row) => [row.ts, row[key]])
    };
  }

  function renderWarnings(rows) {
    const warnings = rows
      .filter((row) => row.warnings && row.warnings !== 'OK')
      .slice(-10)
      .reverse();
    el.warningList.replaceChildren();
    if (!warnings.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'OK in selected range';
      el.warningList.appendChild(empty);
      return;
    }

    warnings.forEach((row) => {
      const item = document.createElement('div');
      item.className = 'warning-item';
      const title = document.createElement('strong');
      title.textContent = row.warnings;
      const time = document.createElement('span');
      time.textContent = row.label || formatFullTime(row.ts);
      item.append(title, time);
      el.warningList.appendChild(item);
    });
  }

  function buildWeekHeatmap(rows) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hours = Array.from({ length: 24 }, (_, index) => String(index));
    const groups = new Map();
    rows.forEach((row) => {
      if (row.pm25 == null || !row.ts) return;
      const parts = bangkokParts(row.ts);
      const key = `${parts.day}-${parts.hour}`;
      const current = groups.get(key) || { sum: 0, count: 0 };
      current.sum += row.pm25;
      current.count += 1;
      groups.set(key, current);
    });

    let max = 0;
    const data = [];
    for (let day = 0; day < 7; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const item = groups.get(`${day}-${hour}`);
        const value = item ? item.sum / item.count : 0;
        max = Math.max(max, value);
        data.push([hour, day, Math.round(value * 10) / 10]);
      }
    }
    return {
      title: 'PM2.5 by weekday and hour',
      subtitle: 'Weekly pattern',
      xLabels: hours,
      yLabels: days,
      xInterval: 2,
      data,
      max,
      tooltip: (params) => {
        const [hour, day, value] = params.value;
        return `${days[day]} ${pad2(hour)}:00<br>PM2.5 ${formatNumber(value, 1)} ug/m3`;
      }
    };
  }

  function buildMonthHeatmap(rows) {
    const hours = Array.from({ length: 24 }, (_, index) => String(index));
    const rowsWithDate = rows
      .filter((row) => row.ts && row.pm25 != null)
      .map((row) => ({ ...row, dateKey: bangkokDateKey(row.ts), label: bangkokDateLabel(row.ts) }))
      .sort((a, b) => a.ts - b.ts);
    const labels = [...new Map(rowsWithDate.map((row) => [row.dateKey, row.label])).values()].slice(-31);
    const keys = [...new Set(rowsWithDate.map((row) => row.dateKey))].slice(-31);
    const keyIndex = new Map(keys.map((key, index) => [key, index]));
    const groups = new Map();

    rowsWithDate.forEach((row) => {
      if (!keyIndex.has(row.dateKey)) return;
      const hour = bangkokParts(row.ts).hour;
      const key = `${keyIndex.get(row.dateKey)}-${hour}`;
      const current = groups.get(key) || { sum: 0, count: 0 };
      current.sum += row.pm25;
      current.count += 1;
      groups.set(key, current);
    });

    let max = 0;
    const data = [];
    labels.forEach((_, dayIndex) => {
      hours.forEach((_, hour) => {
        const item = groups.get(`${dayIndex}-${hour}`);
        const value = item ? item.sum / item.count : 0;
        max = Math.max(max, value);
        data.push([hour, dayIndex, Math.round(value * 10) / 10]);
      });
    });

    return {
      title: 'PM2.5 by day and hour',
      subtitle: 'Monthly pattern',
      xLabels: hours,
      yLabels: labels,
      xInterval: 2,
      data,
      max,
      tooltip: (params) => {
        const [hour, day, value] = params.value;
        return `${labels[day]} ${pad2(hour)}:00<br>PM2.5 ${formatNumber(value, 1)} ug/m3`;
      }
    };
  }

  function buildYearHeatmap(rows) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = Array.from({ length: 31 }, (_, index) => String(index + 1));
    const groups = new Map();

    rows.forEach((row) => {
      if (!row.ts || row.pm25 == null) return;
      const parts = bangkokMonthDay(row.ts);
      const key = `${parts.month}-${parts.day}`;
      const current = groups.get(key) || { sum: 0, count: 0 };
      current.sum += row.pm25;
      current.count += 1;
      groups.set(key, current);
    });

    let max = 0;
    const data = [];
    days.forEach((_, dayIndex) => {
      months.forEach((_, monthIndex) => {
        const item = groups.get(`${monthIndex}-${dayIndex + 1}`);
        const value = item ? item.sum / item.count : 0;
        max = Math.max(max, value);
        data.push([monthIndex, dayIndex, Math.round(value * 10) / 10]);
      });
    });

    return {
      title: 'PM2.5 daily average by month',
      subtitle: 'Yearly pattern',
      xLabels: months,
      yLabels: days,
      xInterval: 0,
      data,
      max,
      tooltip: (params) => {
        const [month, day, value] = params.value;
        return `${months[month]} ${day + 1}<br>PM2.5 ${formatNumber(value, 1)} ug/m3`;
      }
    };
  }

  function bangkokParts(ts) {
    const shifted = new Date(ts + BANGKOK_OFFSET_MS);
    const jsDay = shifted.getUTCDay();
    return {
      day: (jsDay + 6) % 7,
      hour: shifted.getUTCHours()
    };
  }

  function bangkokDateKey(ts) {
    const shifted = new Date(ts + BANGKOK_OFFSET_MS);
    return [
      shifted.getUTCFullYear(),
      pad2(shifted.getUTCMonth() + 1),
      pad2(shifted.getUTCDate())
    ].join('-');
  }

  function bangkokDateLabel(ts) {
    const shifted = new Date(ts + BANGKOK_OFFSET_MS);
    return `${pad2(shifted.getUTCDate())}/${pad2(shifted.getUTCMonth() + 1)}`;
  }

  function bangkokMonthDay(ts) {
    const shifted = new Date(ts + BANGKOK_OFFSET_MS);
    return {
      month: shifted.getUTCMonth(),
      day: shifted.getUTCDate()
    };
  }

  function setMetric(target, value, digits) {
    target.textContent = value == null ? '--' : formatNumber(value, digits);
  }

  function setLoading(isLoading) {
    el.refreshButton.disabled = isLoading;
    el.refreshButton.classList.toggle('is-loading', isLoading);
  }

  function applyLevel(card, level) {
    card.classList.remove('level-good', 'level-watch', 'level-elevated', 'level-high', 'level-severe');
    card.classList.add(`level-${level || 'good'}`);
  }

  function levelForPm25(value) {
    if (value == null) return 'good';
    if (value <= 15) return 'good';
    if (value <= 25) return 'watch';
    if (value <= 37.5) return 'elevated';
    if (value <= 75) return 'high';
    return 'severe';
  }

  function levelForPm10(value) {
    if (value == null) return 'good';
    if (value <= 50) return 'good';
    if (value <= 80) return 'watch';
    if (value <= 120) return 'elevated';
    if (value <= 180) return 'high';
    return 'severe';
  }

  function showError(message) {
    clearError();
    const banner = document.createElement('div');
    banner.id = 'errorBanner';
    banner.className = 'error-banner';
    banner.textContent = message;
    document.querySelector('.toolbar').after(banner);
    el.liveStatus.textContent = 'ERROR';
    el.liveStatus.classList.remove('status-live', 'status-stale');
    el.liveStatus.classList.add('status-muted');
  }

  function clearError() {
    const existing = document.getElementById('errorBanner');
    if (existing) existing.remove();
  }

  function resizeCharts() {
    Object.values(charts).forEach((chart) => chart.resize());
  }

  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), wait);
    };
  }

  function formatNumber(value, digits = 1) {
    if (value == null || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString('en-US', {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    });
  }

  function rowsLabel(value) {
    return value == null ? '--' : Number(value).toLocaleString('en-US');
  }

  function metricTimeMeta(timeLabel, stats) {
    const time = timeLabel ? `Latest hourly ${timeLabel}` : 'Latest hourly --';
    const avg = stats && stats.avg != null ? `Avg ${formatNumber(stats.avg, 1)}` : '';
    return avg ? `${time} | ${avg}` : time;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatAxisTime(value) {
    const shifted = new Date(Number(value) + BANGKOK_OFFSET_MS);
    return `${pad2(shifted.getUTCDate())}/${pad2(shifted.getUTCMonth() + 1)} ${pad2(shifted.getUTCHours())}:00`;
  }

  function formatFullTime(ts) {
    if (!ts) return '--';
    const shifted = new Date(Number(ts) + BANGKOK_OFFSET_MS);
    return [
      shifted.getUTCFullYear(),
      pad2(shifted.getUTCMonth() + 1),
      pad2(shifted.getUTCDate())
    ].join('-') + ` ${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
  }
})();
