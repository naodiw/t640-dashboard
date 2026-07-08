(() => {
  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxghsmRB0sMZ4ooEBECytx3lbiFicwEvlMkSTcLzIUPhqoytcMhJQnu7uajKwHg_iim/exec';
  const API_URL = window.T640_DASHBOARD_API || DEFAULT_API_URL;
  const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const state = {
    days: 7,
    rangeMode: 'quick',
    resolution: 'auto',
    heatmapMode: 'week',
    periodValue: '',
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
      'pageTitle', 'sourceNote', 'ownerNote',
      'warningCard', 'pm25Value', 'pm10Value', 'tempValue', 'pressureValue',
      'warningValue', 'pm25Meta', 'pm10Meta', 'tempMeta', 'pressureMeta',
      'lastSeenMeta', 'pointCount', 'warningList', 'heatmapModeControl', 'heatmapSubtitle',
      'heatmapTitle', 'periodInput', 'periodInputLabel'
    ].forEach((id) => {
      el[id] = document.getElementById(id);
    });
  }

  function bindControls() {
    el.rangeControl.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-days]');
      if (!button) return;
      state.days = Number(button.dataset.days);
      state.rangeMode = 'quick';
      [...el.rangeControl.querySelectorAll('button')].forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      syncHeatmapModeFromQuickRange(state.days);
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
      state.rangeMode = 'period';
      clearQuickRangeActive();
      setDefaultPeriodValue();
      syncHeatmapModeButtons();
      syncPeriodInput();
      loadDashboard();
    });

    el.periodInput.addEventListener('change', () => {
      state.periodValue = el.periodInput.value;
      state.rangeMode = 'period';
      clearQuickRangeActive();
      loadDashboard();
    });

    setDefaultPeriodValue();
    syncPeriodInput();
  }

  function setRangeDays(days) {
    state.days = days;
    state.rangeMode = 'quick';
    [...el.rangeControl.querySelectorAll('button')].forEach((item) => {
      item.classList.toggle('active', Number(item.dataset.days) === days);
    });
    syncHeatmapModeFromQuickRange(days);
    loadDashboard();
  }

  function dashboardRangeParams() {
    if (state.rangeMode === 'period') {
      const range = selectedPeriodRange();
      return {
        from: String(range.from),
        to: String(range.to)
      };
    }
    return { days: String(state.days) };
  }

  function selectedPeriodRange() {
    setDefaultPeriodValue();
    if (state.heatmapMode === 'year') {
      const year = Number(state.periodValue) || bangkokNowParts().year;
      return localRange(year, 0, 1, year + 1, 0, 1);
    }
    if (state.heatmapMode === 'month') {
      const parts = parseMonthValue(state.periodValue) || bangkokNowParts();
      return localRange(parts.year, parts.month - 1, 1, parts.month === 12 ? parts.year + 1 : parts.year, parts.month === 12 ? 0 : parts.month, 1);
    }
    if (state.heatmapMode === 'day') {
      const parts = parseDateValue(state.periodValue) || bangkokNowParts();
      return localRange(parts.year, parts.month - 1, parts.day, parts.year, parts.month - 1, parts.day + 1);
    }

    const parts = parseDateValue(state.periodValue) || bangkokNowParts();
    const startMs = localStartMs(parts.year, parts.month - 1, parts.day);
    const shifted = new Date(startMs + BANGKOK_OFFSET_MS);
    const mondayOffset = (shifted.getUTCDay() + 6) % 7;
    const mondayMs = startMs - mondayOffset * 24 * 3600 * 1000;
    return {
      from: mondayMs,
      to: mondayMs + 7 * 24 * 3600 * 1000 - 1
    };
  }

  function localRange(fromYear, fromMonthIndex, fromDay, toYear, toMonthIndex, toDay) {
    return {
      from: localStartMs(fromYear, fromMonthIndex, fromDay),
      to: localStartMs(toYear, toMonthIndex, toDay) - 1
    };
  }

  function localStartMs(year, monthIndex, day) {
    return Date.UTC(year, monthIndex, day) - BANGKOK_OFFSET_MS;
  }

  function setDefaultPeriodValue() {
    if (state.periodValue && periodValueMatchesMode(state.periodValue)) return;
    const now = bangkokNowParts();
    if (state.heatmapMode === 'year') state.periodValue = String(now.year);
    else if (state.heatmapMode === 'month') state.periodValue = `${now.year}-${pad2(now.month)}`;
    else state.periodValue = `${now.year}-${pad2(now.month)}-${pad2(now.day)}`;
  }

  function periodValueMatchesMode(value) {
    if (state.heatmapMode === 'year') return /^\d{4}$/.test(value);
    if (state.heatmapMode === 'month') return /^\d{4}-\d{2}$/.test(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function syncPeriodInput() {
    if (state.heatmapMode === 'year') {
      el.periodInput.type = 'number';
      el.periodInput.min = '2000';
      el.periodInput.max = '2100';
      el.periodInput.step = '1';
      el.periodInputLabel.textContent = 'Year';
    } else if (state.heatmapMode === 'month') {
      el.periodInput.type = 'month';
      el.periodInput.removeAttribute('min');
      el.periodInput.removeAttribute('max');
      el.periodInput.removeAttribute('step');
      el.periodInputLabel.textContent = 'Month';
    } else if (state.heatmapMode === 'day') {
      el.periodInput.type = 'date';
      el.periodInputLabel.textContent = 'Date';
    } else {
      el.periodInput.type = 'date';
      el.periodInputLabel.textContent = 'Week of';
    }
    el.periodInput.value = state.periodValue;
  }

  function syncHeatmapModeButtons() {
    [...el.heatmapModeControl.querySelectorAll('button')].forEach((item) => {
      item.classList.toggle('active', item.dataset.mode === state.heatmapMode);
    });
  }

  function syncHeatmapModeFromQuickRange(days) {
    if (days === 1) state.heatmapMode = 'day';
    else if (days >= 365) state.heatmapMode = 'year';
    else if (days >= 30) state.heatmapMode = 'month';
    else state.heatmapMode = 'week';
    setDefaultPeriodValue();
    syncHeatmapModeButtons();
    syncPeriodInput();
  }

  function clearQuickRangeActive() {
    [...el.rangeControl.querySelectorAll('button')].forEach((item) => item.classList.remove('active'));
  }

  function parseDateValue(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  function parseMonthValue(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: 1 };
  }

  function bangkokNowParts() {
    const shifted = new Date(Date.now() + BANGKOK_OFFSET_MS);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate()
    };
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
        ...dashboardRangeParams(),
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

    renderConfig(data.config || {});
    renderStatus(latest);
    renderMetrics(data, latest);
    renderCharts(rows, data);
    renderWarnings(rows);
  }

  function renderConfig(config) {
    const pageTitle = cleanConfigText(config.page_title) || 'T640 Live Dashboard';
    const sourceNote = cleanConfigText(config.source_note) || 'Public Air Monitor';
    const ownerNote = cleanConfigText(config.owner_note);

    document.title = pageTitle;
    el.pageTitle.textContent = pageTitle;
    el.sourceNote.textContent = sourceNote;
    el.ownerNote.textContent = ownerNote;
    el.ownerNote.hidden = !ownerNote;
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

    el.pm25Meta.textContent = metricTimeMeta(latest.label, latest.pm25TsLabel || latest.updatedLabel, summary.pm25);
    el.pm10Meta.textContent = metricTimeMeta(latest.label, latest.pm10TsLabel || latest.updatedLabel, summary.pm10);
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
        lineSeries('PM2.5', rows, 'pm25', '#16a36f', {
          areaColor: riskAreaGradient('rgba(22, 163, 111, 0.08)'),
          areaOpacity: 1,
          width: 3,
          shadowBlur: 4,
          shadowColor: 'rgba(22, 163, 111, 0.18)',
          z: 3
        }),
        lineSeries('PM10', rows, 'pm10', '#3f6fb5', {
          areaColor: riskAreaGradient('rgba(63, 111, 181, 0.06)'),
          areaOpacity: 1,
          width: 3,
          shadowBlur: 4,
          shadowColor: 'rgba(63, 111, 181, 0.18)',
          z: 2
        })
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
    const heat = mode === 'year' ? buildYearHeatmap(rows) : mode === 'month' ? buildMonthHeatmap(rows) : mode === 'day' ? buildDayHeatmap(rows) : buildWeekHeatmap(rows);
    const heatmapNode = document.getElementById('heatmapChart');
    heatmapNode.style.height = mode === 'month' ? '620px' : mode === 'year' ? '460px' : mode === 'day' ? '240px' : '350px';
    el.heatmapSubtitle.textContent = heat.subtitle;
    el.heatmapTitle.textContent = heat.title;
    charts.heatmap.setOption({
      animationDuration: 450,
      tooltip: {
        position: 'top',
        formatter: (params) => {
          if (params.seriesName === 'No data') return heat.missingTooltip(params);
          return heat.tooltip(params);
        }
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
        seriesIndex: 1,
        inRange: {
          color: ['#d8f1e7', '#f4d35e', '#ee964b', '#c93b3b']
        }
      },
      series: [
        {
          name: 'No data',
          type: 'heatmap',
          data: heat.missingData,
          itemStyle: {
            color: '#e7ebef',
            borderColor: '#f6f8fa',
            borderWidth: 1
          },
          emphasis: {
            itemStyle: {
              color: '#d8dee5'
            }
          }
        },
        {
          name: 'PM2.5',
          type: 'heatmap',
          data: heat.data,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(24, 32, 42, 0.22)'
            }
          }
        }
      ]
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

  function lineSeries(name, rows, key, color, options = {}) {
    return {
      name,
      type: 'line',
      showSymbol: false,
      smooth: true,
      connectNulls: false,
      z: options.z || 1,
      lineStyle: {
        width: options.width || 2.5,
        color,
        shadowBlur: options.shadowBlur || 0,
        shadowColor: options.shadowColor || 'transparent'
      },
      areaStyle: {
        opacity: options.areaOpacity == null ? 0.08 : options.areaOpacity,
        color: options.areaColor || color
      },
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: (options.width || 2.5) + 0.8
        }
      },
      data: rows.map((row) => [row.ts, row[key]])
    };
  }

  function riskAreaGradient(lowColor) {
    return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: 'rgba(122, 29, 29, 0.42)' },
      { offset: 0.2, color: 'rgba(201, 59, 59, 0.30)' },
      { offset: 0.46, color: 'rgba(238, 106, 46, 0.18)' },
      { offset: 0.7, color: 'rgba(244, 211, 94, 0.11)' },
      { offset: 1, color: lowColor }
    ]);
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
    const missingData = [];
    for (let day = 0; day < 7; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const item = groups.get(`${day}-${hour}`);
        if (!item) {
          missingData.push([hour, day, 0]);
          continue;
        }
        const value = item.sum / item.count;
        max = Math.max(max, value);
        data.push([hour, day, Math.round(value * 10) / 10]);
      }
    }
    return {
      title: 'PM2.5 by weekday and hour ending',
      subtitle: 'Weekly pattern',
      xLabels: hours,
      yLabels: days,
      xInterval: 2,
      data,
      missingData,
      max,
      tooltip: (params) => {
        const [hour, day, value] = params.value;
        return `${days[day]} hour ending ${pad2(hour)}:00<br>PM2.5 ${formatNumber(value, 1)} ug/m3`;
      },
      missingTooltip: (params) => {
        const [hour, day] = params.value;
        return `${days[day]} hour ending ${pad2(hour)}:00<br>No data`;
      }
    };
  }

  function buildDayHeatmap(rows) {
    const hours = Array.from({ length: 24 }, (_, index) => String(index));
    const label = dayRangeLabel();
    const groups = new Map();

    rows.forEach((row) => {
      if (!row.ts || row.pm25 == null) return;
      const hour = bangkokParts(row.ts).hour;
      const current = groups.get(hour) || { sum: 0, count: 0 };
      current.sum += row.pm25;
      current.count += 1;
      groups.set(hour, current);
    });

    let max = 0;
    const data = [];
    const missingData = [];
    hours.forEach((_, hour) => {
      const item = groups.get(hour);
      if (!item) {
        missingData.push([hour, 0, 0]);
        return;
      }
      const value = item.sum / item.count;
      max = Math.max(max, value);
      data.push([hour, 0, Math.round(value * 10) / 10]);
    });

    return {
      title: 'PM2.5 by hour ending',
      subtitle: `Daily pattern ${label}`,
      xLabels: hours,
      yLabels: [label],
      xInterval: 1,
      data,
      missingData,
      max,
      tooltip: (params) => {
        const [hour, , value] = params.value;
        return `${label} hour ending ${pad2(hour)}:00<br>PM2.5 ${formatNumber(value, 1)} ug/m3`;
      },
      missingTooltip: (params) => {
        const [hour] = params.value;
        return `${label} hour ending ${pad2(hour)}:00<br>No data`;
      }
    };
  }

  function buildMonthHeatmap(rows) {
    const hours = Array.from({ length: 24 }, (_, index) => String(index));
    const monthDays = monthDayLabels();
    const labels = monthDays.map((item) => item.label);
    const keys = monthDays.map((item) => item.key);
    const keyIndex = new Map(keys.map((key, index) => [key, index]));
    const groups = new Map();

    rows.forEach((row) => {
      if (!row.ts || row.pm25 == null) return;
      const dateKey = bangkokDateKey(row.ts);
      if (!keyIndex.has(dateKey)) return;
      const hour = bangkokParts(row.ts).hour;
      const key = `${keyIndex.get(dateKey)}-${hour}`;
      const current = groups.get(key) || { sum: 0, count: 0 };
      current.sum += row.pm25;
      current.count += 1;
      groups.set(key, current);
    });

    let max = 0;
    const data = [];
    const missingData = [];
    labels.forEach((_, dayIndex) => {
      hours.forEach((_, hour) => {
        const item = groups.get(`${dayIndex}-${hour}`);
        if (!item) {
          missingData.push([hour, dayIndex, 0]);
          return;
        }
        const value = item.sum / item.count;
        max = Math.max(max, value);
        data.push([hour, dayIndex, Math.round(value * 10) / 10]);
      });
    });

    return {
      title: 'PM2.5 by day and hour ending',
      subtitle: 'Monthly pattern',
      xLabels: hours,
      yLabels: labels,
      xInterval: 2,
      data,
      missingData,
      max,
      tooltip: (params) => {
        const [hour, day, value] = params.value;
        return `${labels[day]} hour ending ${pad2(hour)}:00<br>PM2.5 ${formatNumber(value, 1)} ug/m3`;
      },
      missingTooltip: (params) => {
        const [hour, day] = params.value;
        return `${labels[day]} hour ending ${pad2(hour)}:00<br>No data`;
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
    const missingData = [];
    days.forEach((_, dayIndex) => {
      months.forEach((_, monthIndex) => {
        const item = groups.get(`${monthIndex}-${dayIndex + 1}`);
        if (!item) {
          missingData.push([monthIndex, dayIndex, 0]);
          return;
        }
        const value = item.sum / item.count;
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
      missingData,
      max,
      tooltip: (params) => {
        const [month, day, value] = params.value;
        return `${months[month]} ${day + 1}<br>PM2.5 ${formatNumber(value, 1)} ug/m3`;
      },
      missingTooltip: (params) => {
        const [month, day] = params.value;
        return `${months[month]} ${day + 1}<br>No data`;
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

  function dayRangeLabel() {
    const parts = state.rangeMode === 'period' && state.heatmapMode === 'day'
      ? parseDateValue(state.periodValue)
      : bangkokNowParts();
    return `${pad2(parts.day)}/${pad2(parts.month)}`;
  }

  function monthDayLabels() {
    const parts = state.rangeMode === 'period' && state.heatmapMode === 'month'
      ? parseMonthValue(state.periodValue)
      : bangkokNowParts();
    const year = parts.year;
    const month = parts.month;
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: count }, (_, index) => {
      const day = index + 1;
      return {
        key: `${year}-${pad2(month)}-${pad2(day)}`,
        label: `${pad2(day)}/${pad2(month)}`
      };
    });
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

  function metricTimeMeta(hourLabel, dataLabel, stats) {
    const time = hourLabel ? `Hour ending ${hourLabel}` : 'Hour ending --';
    const data = dataLabel ? `Data ${dataLabel}` : '';
    const avg = stats && stats.avg != null ? `Avg ${formatNumber(stats.avg, 1)}` : '';
    return [time, data, avg].filter(Boolean).join(' | ');
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

  function cleanConfigText(value) {
    return String(value || '').trim();
  }
})();
