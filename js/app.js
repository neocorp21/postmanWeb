/* ============================================================
   API Tester — app.js (Con Diagnóstico y Métricas Integrado)
   ============================================================ */

/* ============================================================
   Constants
============================================================ */
const CONFIG = Object.freeze({
    ENDPOINT_URL: ' https://consumoarquitectura-production.up.railway.app/api/v1/architecture/endpoints',

    STORAGE: {
        BASE_URL: 'at_baseUrl',
        TOKEN: 'at_bearerToken'
    },

    HTTP: {
        DEFAULT_TIMEOUT: 30000
    }
});

/* ============================================================
   Global State
============================================================ */
const state = {
    endpoints: [],
    selected: null,
    controller: null
};

/* ============================================================
   DOM Cache
============================================================ */
const DOM = {};

function initDOM() {
    const ids = [
        'baseUrl',
        'bearerToken',
        'endpointSearch',
        'endpointList',
        'totalCount',
        'urlMethod',
        'urlDisplay',
        'sendBtn',
        'sendBtnText',
        'sendSpinner',
        'cancelBtn',
        'runnerBtn',
        'endpointMeta',
        'addQueryBtn',
        'addHeaderBtn',
        'pathVarsSection',
        'pathVarRows',
        'queryParamRows',
        'headerRows',
        'bodyEditor',
        'bodyDtoLabel',
        'responseEmpty',
        'responseContent',
        'statusBadge',
        'responseTime',
        'responseSize',
        'responseBody',
        'responseHeaders',
        'copyRespBtn',
        'timeDns',
        'timeTtfb',
        'timeDownload',
        'barDns',
        'barTtfb',
        'barDownload',
        'runnerResults'
    ];

    ids.forEach(id => {
        DOM[id] = document.getElementById(id);
    });
}

/* ============================================================
   Application Start
============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    initDOM();
    restoreSettings();
    registerEvents();
    await loadEndpoints();
});

/* ============================================================
   Events
============================================================ */
function registerEvents() {
    if (DOM.baseUrl) {
        DOM.baseUrl.addEventListener('input', debounce(() => {
            saveSettings();
            if (state.selected) renderUrlBar(state.selected);
        }, 300));
    }

    if (DOM.bearerToken) {
        DOM.bearerToken.addEventListener('input', debounce(() => {
            saveSettings();
            if (state.selected) populateHeaders(state.selected);
        }, 300));
    }

    if (DOM.endpointSearch) {
        DOM.endpointSearch.addEventListener('input', (e) => {
            filterEndpoints(e.target.value);
        });
    }

    if (DOM.endpointList) {
        DOM.endpointList.addEventListener('click', event => {
            const row = event.target.closest('.ep-row');
            if (!row || row.dataset.index === undefined) return;
            selectEndpoint(Number(row.dataset.index));
        });
    }

    // Botones de ejecución
    if (DOM.sendBtn) DOM.sendBtn.addEventListener('click', () => sendRequest());
    if (DOM.cancelBtn) DOM.cancelBtn.addEventListener('click', cancelRequest);
    if (DOM.runnerBtn) DOM.runnerBtn.addEventListener('click', runBurstTest);

    // Pestañas
    const requestTabBar = document.querySelector('.tab-bar');
    if (requestTabBar) {
        requestTabBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn[data-tab]');
            if (btn) switchTab(btn.dataset.tab);
        });
    }

    const responseTabBar = document.querySelector('.resp-tabs');
    if (responseTabBar) {
        responseTabBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn[data-resp-tab]');
            if (btn) switchRespTab(btn.dataset.respTab);
        });
    }

    if (DOM.addQueryBtn) DOM.addQueryBtn.addEventListener('click', addQueryParam);
    if (DOM.addHeaderBtn) DOM.addHeaderBtn.addEventListener('click', addHeader);

    if (DOM.copyRespBtn) {
        DOM.copyRespBtn.addEventListener('click', () => {
            const text = DOM.responseBody ? DOM.responseBody.textContent : '';
            if (!text) return;

            navigator.clipboard.writeText(text).then(() => {
                const prev = DOM.copyRespBtn.textContent;
                DOM.copyRespBtn.textContent = '¡Copiado!';
                setTimeout(() => DOM.copyRespBtn.textContent = prev, 1500);
            });
        });
    }
}

/* ============================================================
   Storage
============================================================ */
function saveSettings() {
    if (DOM.baseUrl) localStorage.setItem(CONFIG.STORAGE.BASE_URL, DOM.baseUrl.value);
    if (DOM.bearerToken) localStorage.setItem(CONFIG.STORAGE.TOKEN, DOM.bearerToken.value);
}

function restoreSettings() {
    const baseUrl = localStorage.getItem(CONFIG.STORAGE.BASE_URL);
    const token = localStorage.getItem(CONFIG.STORAGE.TOKEN);

    if (baseUrl && DOM.baseUrl) DOM.baseUrl.value = baseUrl;
    if (token && DOM.bearerToken) DOM.bearerToken.value = token;
}

/* ============================================================
   Load & Render Endpoints
============================================================ */
async function loadEndpoints() {
    try {
         const response = await fetch(CONFIG.ENDPOINT_URL, {
            headers: {
                "ngrok-skip-browser-warning": "true"
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        state.endpoints = await response.json();
        if (DOM.totalCount) DOM.totalCount.textContent = `${state.endpoints.length} total`;

        renderSidebar(state.endpoints);
        if (state.endpoints.length) selectEndpoint(0);
    } catch (error) {
        renderLoadError(error);
    }
}

function renderSidebar(eps) {
    if (!DOM.endpointList) return;

    const groups = {};
    eps.forEach((ep, idx) => {
        const c = ep.controller || 'Otros';
        if (!groups[c]) groups[c] = [];
        groups[c].push({ ep, idx });
    });

    DOM.endpointList.innerHTML = '';
    for (const [ctrl, items] of Object.entries(groups)) {
        const group = document.createElement('div');
        group.className = 'controller-group';
        group.innerHTML = `<div class="controller-label">${escapeHtml(ctrl)}</div>`;

        items.forEach(({ ep, idx }) => {
            const row = document.createElement('div');
            row.className = 'ep-row';
            row.id = `ep-row-${idx}`;
            row.dataset.index = idx;

            const icons = buildIcons(ep);
            row.innerHTML = `
                <span class="method-badge method-${ep.method.toLowerCase()}">${ep.method}</span>
                <span class="ep-path">${escapeHtml(ep.operation || ep.path)}</span>
                <span class="ep-icons">${icons}</span>`;
            group.appendChild(row);
        });
        DOM.endpointList.appendChild(group);
    }
}

function filterEndpoints(query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll('.ep-row').forEach(row => {
        const idx = row.dataset.index;
        const ep = state.endpoints[idx];
        if (!ep) return;

        const match = ep.path.toLowerCase().includes(q) ||
            ep.method.toLowerCase().includes(q) ||
            (ep.operation && ep.operation.toLowerCase().includes(q));

        row.style.display = match ? 'flex' : 'none';
    });

    document.querySelectorAll('.controller-group').forEach(group => {
        const hasVisible = Array.from(group.querySelectorAll('.ep-row'))
            .some(r => r.style.display !== 'none');
        group.style.display = hasVisible ? 'block' : 'none';
    });
}

function buildIcons(ep) {
    let html = '';
    if (ep.secured) {
        html += `<svg class="icon-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    }
    if (ep.annotations?.RateLimited) {
        html += `<span class="icon-rate" title="Rate Limited">RL</span>`;
    }
    return html;
}

function renderLoadError(error) {
    if (DOM.endpointList) {
        DOM.endpointList.innerHTML = `
            <p class="loading-msg error" style="color:#f87171; padding: 1rem;">
                Error cargando endpoints: ${escapeHtml(error.message)}<br>
                <small>Asegúrate de que la API esté corriendo en <code>${CONFIG.ENDPOINT_URL}</code></small>
            </p>
        `;
    }
}

/* ============================================================
   Select Endpoint & Populate Views
============================================================ */
function selectEndpoint(idx) {
    document.querySelectorAll('.ep-row').forEach(r => r.classList.remove('active'));
    const row = document.getElementById(`ep-row-${idx}`);
    if (row) row.classList.add('active');

    state.selected = state.endpoints[idx];
    clearResponse();
    renderUrlBar(state.selected);
    renderMeta(state.selected);
    populateParams(state.selected);
    populateHeaders(state.selected);
    populateBody(state.selected);
    switchTab('params');
}

function renderUrlBar(ep) {
    if (DOM.urlMethod) {
        DOM.urlMethod.textContent = ep.method;
        DOM.urlMethod.className = `method-badge method-${ep.method.toLowerCase()}`;
    }
    if (DOM.urlDisplay) {
        DOM.urlDisplay.value = buildUrl(ep);
    }
}

function buildUrl(ep) {
    const base = DOM.baseUrl ? DOM.baseUrl.value.replace(/\/$/, '') : '';
    let path = ep.path;

    document.querySelectorAll('.kv-val[data-pathvar]').forEach(inp => {
        const name = inp.dataset.pathvar;
        const value = inp.value;
        path = path.replace(`{${name}}`, encodeURIComponent(value));
    });

    const params = new URLSearchParams();
    if (DOM.queryParamRows) {
        DOM.queryParamRows.querySelectorAll('.kv-row').forEach(row => {
            const k = row.querySelector('.kv-key').value.trim();
            const v = row.querySelector('.kv-val').value.trim();
            if (k) params.append(k, v);
        });
    }

    const qs = params.toString();
    return base + path + (qs ? '?' + qs : '');
}

function renderMeta(ep) {
    if (!DOM.endpointMeta) return;

    let html = `<span class="tag-meta">${escapeHtml(ep.path)}</span>`;
    if (ep.secured) html += `<span class="tag tag-secure">Seguro</span>`;
    if (ep.annotations?.RateLimited) {
        const rl = ep.annotations.RateLimited;
        html += `<span class="tag tag-rate" title="Rate Limited">RL ${rl.maxRequests}/${rl.timeWindowSeconds}s</span>`;
    }
    if (ep.annotations?.OwnerOnly) {
        html += `<span class="tag tag-owner">OwnerOnly</span>`;
    }
    DOM.endpointMeta.innerHTML = html;
}

function populateParams(ep) {
    if (!DOM.pathVarRows || !DOM.queryParamRows) return;

    DOM.pathVarRows.innerHTML = '';
    DOM.queryParamRows.innerHTML = '';

    if (ep.pathVariables && Object.keys(ep.pathVariables).length > 0) {
        if (DOM.pathVarsSection) DOM.pathVarsSection.classList.remove('hidden');
        for (const [key, val] of Object.entries(ep.pathVariables)) {
            DOM.pathVarRows.appendChild(makeKvRow(key, String(val), true, 'pathvar', key));
        }
    } else {
        if (DOM.pathVarsSection) DOM.pathVarsSection.classList.add('hidden');
    }

    if (ep.queryParams) {
        for (const [key, val] of Object.entries(ep.queryParams)) {
            DOM.queryParamRows.appendChild(makeKvRow(key, String(val)));
        }
    }

    addLiveUrlUpdate('#pathVarRows, #queryParamRows');
}

function populateHeaders(ep) {
    if (!DOM.headerRows) return;

    DOM.headerRows.innerHTML = '';
    const token = DOM.bearerToken ? DOM.bearerToken.value.trim() : '';
    const headers = { ...(ep.headers || {}) };

    if (token && (headers['Authorization'] || ep.secured)) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    for (const [key, val] of Object.entries(headers)) {
        DOM.headerRows.appendChild(makeKvRow(key, val));
    }
}

function populateBody(ep) {
    if (!DOM.bodyEditor || !DOM.bodyDtoLabel) return;

    if (ep.requestBody) {
        DOM.bodyDtoLabel.textContent = `DTO: ${ep.requestBody.dtoName}`;
        DOM.bodyEditor.value = JSON.stringify(ep.requestBody.example, null, 2);
        DOM.bodyEditor.disabled = false;
    } else {
        DOM.bodyDtoLabel.textContent = '';
        DOM.bodyEditor.value = '';
        DOM.bodyEditor.disabled = true;
        DOM.bodyEditor.placeholder = 'Sin body para este endpoint';
    }
}

/* ============================================================
   Key-Value Table Helpers
============================================================ */
function makeKvRow(key, val, keyReadonly = false, dataAttr = null, dataVal = null) {
    const row = document.createElement('div');
    row.className = 'kv-row';

    const keyEl = document.createElement('input');
    keyEl.className = 'kv-key';
    keyEl.value = key;
    if (keyReadonly) {
        keyEl.readOnly = true;
        keyEl.style.opacity = '.6';
    }
    if (dataAttr) keyEl.dataset[dataAttr] = dataVal;

    const valEl = document.createElement('input');
    valEl.className = 'kv-val';
    valEl.value = val;
    if (dataAttr) valEl.dataset[dataAttr] = dataVal;

    const del = document.createElement('button');
    del.className = 'kv-del';
    del.title = 'Eliminar';
    del.type = 'button';
    del.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.onclick = () => {
        row.remove();
        updateUrlDisplay();
    };

    row.appendChild(keyEl);
    row.appendChild(valEl);
    row.appendChild(del);

    valEl.addEventListener('input', updateUrlDisplay);
    return row;
}

function addLiveUrlUpdate(selector) {
    document.querySelectorAll(`${selector} input`).forEach(inp => {
        inp.addEventListener('input', updateUrlDisplay);
    });
}

function updateUrlDisplay() {
    if (state.selected && DOM.urlDisplay) {
        DOM.urlDisplay.value = buildUrl(state.selected);
    }
}

function addQueryParam() {
    if (DOM.queryParamRows) DOM.queryParamRows.appendChild(makeKvRow('', ''));
}

function addHeader() {
    if (DOM.headerRows) DOM.headerRows.appendChild(makeKvRow('', ''));
}

/* ============================================================
   Tabs Switching
============================================================ */
function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(p => {
        const isActive = p.id === `tab-${name}`;
        p.classList.toggle('active', isActive);
        p.classList.toggle('hidden', !isActive);
    });

    document.querySelectorAll('.tab-bar .tab-btn').forEach(btn => {
        const isActive = btn.dataset.tab === name;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive);
    });
}

function switchRespTab(name) {
    document.querySelectorAll('.resp-panel').forEach(p => {
        const isActive = p.id === `resp-tab-${name}`;
        p.classList.toggle('active', isActive);
        p.classList.toggle('hidden', !isActive);
    });

    document.querySelectorAll('.resp-tabs .tab-btn').forEach(btn => {
        const isActive = btn.dataset.respTab === name;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive);
    });
}

/* ============================================================
   Send Requests & Metrics (Diagnóstico de Red)
============================================================ */
async function sendRequest(silent = false) {
    if (!state.selected) return null;

    state.controller = new AbortController();

    if (!silent) {
        if (DOM.sendBtn) DOM.sendBtn.disabled = true;
        if (DOM.sendBtnText) DOM.sendBtnText.classList.add('hidden');
        if (DOM.sendSpinner) DOM.sendSpinner.classList.remove('hidden');
        if (DOM.cancelBtn) DOM.cancelBtn.classList.remove('hidden');
        clearResponse();
    }

    const url = buildUrl(state.selected);
    const method = state.selected.method;
// --- CABECERAS ---
    // 1. Definimos las cabeceras globales/obligatorias
    const headers = {
        "ngrok-skip-browser-warning": "true" // <--- Inyectada automáticamente en TODAS las peticiones
    };// 2. Leemos los headers configurados por el usuario en la UI
    
    if (DOM.headerRows) {
        DOM.headerRows.querySelectorAll('.kv-row').forEach(row => {
            const key = row.querySelector('.kv-key').value.trim();
            const value = row.querySelector('.kv-val').value.trim();
            if (key) headers[key] = value;
        });
    }

    let body;
    if (state.selected.requestBody && DOM.bodyEditor && !DOM.bodyEditor.disabled && DOM.bodyEditor.value.trim()) {
        body = DOM.bodyEditor.value.trim();
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    const start = performance.now();
    let firstByte = 0;

    try {
        const res = await fetch(url, {
            method,
            headers,
            body: (method !== 'GET' && method !== 'HEAD') ? body : undefined,
            signal: state.controller.signal
        });

        firstByte = performance.now();
        const raw = await res.text();
        const end = performance.now();

        // Tiempos
        const totalMs = Math.round(end - start);
        const ttfbMs = Math.round(firstByte - start);
        const downloadMs = Math.round(end - firstByte);
        const size = new Blob([raw]).size;

        if (!silent) {
            showResponse(res.status, res.statusText, totalMs, size, raw, res.headers);
            updateMetricsView(ttfbMs, downloadMs, totalMs);
        }

        return { status: res.status, time: totalMs, size };
    } catch (err) {
        const totalMs = Math.round(performance.now() - start);
        if (!silent) {
            if (err.name === 'AbortError') {
                showError(new Error('Petición cancelada por el usuario'), totalMs);
            } else {
                showError(err, totalMs);
            }
        }
        return { status: 'ERR', time: totalMs, size: 0 };
    } finally {
        if (!silent) {
            if (DOM.sendBtn) DOM.sendBtn.disabled = false;
            if (DOM.sendBtnText) DOM.sendBtnText.classList.remove('hidden');
            if (DOM.sendSpinner) DOM.sendSpinner.classList.add('hidden');
            if (DOM.cancelBtn) DOM.cancelBtn.classList.add('hidden');
        }
        state.controller = null;
    }
}

function cancelRequest() {
    if (state.controller) {
        state.controller.abort();
    }
}

/* ============================================================
   Prueba Ráfaga (Runner x5)
============================================================ */
async function runBurstTest() {
    if (!state.selected || !DOM.runnerResults) return;

    DOM.runnerBtn.disabled = true;
    DOM.runnerResults.innerHTML = '<p class="text-muted">Ejecutando 5 peticiones ráfaga...</p>';
    switchRespTab('metrics');

    const results = [];
    for (let i = 0; i < 5; i++) {
        const res = await sendRequest(true); // silent = true
        if (res) results.push(res);
    }

    const times = results.map(r => r.time);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times);
    const max = Math.max(...times);

    DOM.runnerResults.innerHTML = `
        <div class="runner-stats" style="margin-top: 10px;">
            <p><strong>Promedio:</strong> ${avg} ms | <strong>Min:</strong> ${min} ms | <strong>Max:</strong> ${max} ms</p>
            <small class="text-muted">Peticiones: ${results.map(r => `${r.time}ms (${r.status})`).join(', ')}</small>
        </div>
    `;

    DOM.runnerBtn.disabled = false;
}

/* ============================================================
   Visualización de Métricas de Red
============================================================ */
function updateMetricsView(ttfbMs, downloadMs, totalMs) {
    if (DOM.timeTtfb) DOM.timeTtfb.textContent = `${ttfbMs} ms`;
    if (DOM.timeDownload) DOM.timeDownload.textContent = `${downloadMs} ms`;

    const ttfbPct = totalMs > 0 ? Math.round((ttfbMs / totalMs) * 100) : 50;
    const dlPct = 100 - ttfbPct;

    if (DOM.barTtfb) DOM.barTtfb.style.width = `${ttfbPct}%`;
    if (DOM.barDownload) DOM.barDownload.style.width = `${dlPct}%`;
}

/* ============================================================
   Response Visualization
============================================================ */
function showResponse(status, statusText, elapsed, size, raw, resHeaders) {
    if (DOM.responseEmpty) DOM.responseEmpty.classList.add('hidden');
    if (DOM.responseContent) DOM.responseContent.classList.remove('hidden');

    if (DOM.statusBadge) {
        DOM.statusBadge.textContent = `${status} ${statusText || ''}`;
        DOM.statusBadge.className = 'status-badge ' + statusClass(status);
    }

    if (DOM.responseTime) DOM.responseTime.textContent = `${elapsed} ms`;
    if (DOM.responseSize) DOM.responseSize.textContent = formatSize(size);

    if (DOM.responseBody) {
        if (raw && raw.trim()) {
            try {
                const parsed = JSON.parse(raw);
                DOM.responseBody.innerHTML = syntaxHighlight(JSON.stringify(parsed, null, 2));
            } catch (error) {
                DOM.responseBody.textContent = raw;
            }
        } else {
            DOM.responseBody.textContent = '(sin contenido)';
        }
    }

    if (DOM.responseHeaders) {
        DOM.responseHeaders.innerHTML = '';
        if (resHeaders && typeof resHeaders.forEach === 'function') {
            resHeaders.forEach((val, key) => {
                const row = document.createElement('div');
                row.className = 'kv-row';
                row.innerHTML = `
                    <input class="kv-key" value="${escapeHtml(key)}" readonly style="opacity:.7" />
                    <input class="kv-val" value="${escapeHtml(val)}" readonly />
                `;
                DOM.responseHeaders.appendChild(row);
            });
        }
    }

    switchRespTab('body');
}

function showError(err, elapsed) {
    if (DOM.responseEmpty) DOM.responseEmpty.classList.add('hidden');
    if (DOM.responseContent) DOM.responseContent.classList.remove('hidden');

    if (DOM.statusBadge) {
        DOM.statusBadge.textContent = 'NETWORK ERROR';
        DOM.statusBadge.className = 'status-badge status-5xx';
    }

    if (DOM.responseTime) DOM.responseTime.textContent = `${elapsed} ms`;
    if (DOM.responseSize) DOM.responseSize.textContent = '';

    let message = (err instanceof TypeError)
        ? `No se pudo conectar al servidor.\n\nPosibles causas:\n- CORS bloqueado en la API\n- URL o Puerto incorrectos\n- Servidor fuera de línea`
        : (err.message || 'Error desconocido');

    if (DOM.responseBody) {
        DOM.responseBody.innerHTML = `<pre class="error-msg">${escapeHtml(message)}</pre>`;
    }

    switchRespTab('body');
}

function clearResponse() {
    if (DOM.responseEmpty) DOM.responseEmpty.classList.add('hidden');
    if (DOM.responseContent) DOM.responseContent.classList.add('hidden');
}

/* ============================================================
   Helpers
============================================================ */
function statusClass(s) {
    if (s >= 200 && s < 300) return 'status-2xx';
    if (s >= 300 && s < 400) return 'status-3xx';
    if (s >= 400 && s < 500) return 'status-4xx';
    return 'status-5xx';
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function syntaxHighlight(json) {
    return json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        match => {
            let cls = 'json-num';
            if (/^"/.test(match)) {
                cls = /:$/.test(match) ? 'json-key' : 'json-str';
            } else if (/true|false/.test(match)) {
                cls = 'json-bool';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return `<span class="${cls}">${escapeHtml(match)}</span>`;
        }
    );
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
