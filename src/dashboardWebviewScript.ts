/**
 * Client-side script template for the Antigravity Mission Hub Webview
 */
export function getDashboardJsTemplate(): string {
    return `
const vscode = acquireVsCodeApi();
const state = vscode.getState() || {};
let accounts = ACCOUNTS_PLACEHOLDER;
let groupsConfig = GROUPS_PLACEHOLDER;
let activeAccountId = state.activeAccountId;
let serviceStatus = SERVICE_STATUS_PLACEHOLDER;
let groupModelScope = 'current';

function getDisplayName(name) {
    if (!name) return '';
    const n = name.trim();
    const lower = n.toLowerCase();
    const dm = {
        'gemini-3-flash': 'Gemini 3 Flash',
        'gemini-3-flash-agent': 'Gemini 3 Flash (Agent)',
        'gemini-3.1-flash-image': 'Gemini 3.1 Flash (Image)',
        'gemini-3.1-flash-lite': 'Gemini 3.1 Flash (Lite)',
        'gemini-3.1-pro-high': 'Gemini 3.1 Pro (High)',
        'gemini-3.1-pro-low': 'Gemini 3.1 Pro (Low)',
        'gemini-3.5-flash-low': 'Gemini 3.5 Flash (Low)',
        'gemini-3.5-flash-medium': 'Gemini 3.5 Flash (Medium)',
        'gemini-3.5-flash-high': 'Gemini 3.5 Flash (High)',
        'gemini-pro-agent': 'Gemini Pro (Agent)',
        'claude-sonnet-4.6': 'Claude Sonnet 4.6 (Thinking)',
        'claude-sonnet-4-6': 'Claude Sonnet 4.6 (Thinking)',
        'claude-opus-4.6': 'Claude Opus 4.6 (Thinking)',
        'claude-opus-4-6-thinking': 'Claude Opus 4.6 (Thinking)',
        'claude-opus-5.5': 'Claude Opus 5.5 (Thinking)',
        'claude-opus-5-5': 'Claude Opus 5.5 (Thinking)',
        'claude-opus-5-5-thinking': 'Claude Opus 5.5 (Thinking)',
        'claude-sonnet-5.5': 'Claude Sonnet 5.5 (Thinking)',
        'claude-sonnet-5-5': 'Claude Sonnet 5.5 (Thinking)',
        'claude-sonnet-5-5-thinking': 'Claude Sonnet 5.5 (Thinking)',
        'gpt-oss-120b-medium': 'GPT-OSS 120B (Medium)'
    };
    if (dm[lower]) return dm[lower];
    if (lower.startsWith('gemini')) {
        const norm = n.replace(/gemini-(\\d+)-(\\d+)/i, 'gemini-$1.$2');
        const parts = norm.split('-');
        const suffixMap = { 'pro': 'Pro', 'flash': 'Flash', 'agent': '(Agent)', 'image': '(Image)', 'lite': '(Lite)', 'high': '(High)', 'medium': '(Medium)', 'low': '(Low)' };
        const out = parts.map((p, i) => {
            if (i === 0) return 'Gemini';
            const pl = p.toLowerCase();
            if (suffixMap[pl]) return suffixMap[pl];
            if (/^\\d+(\\.\\d+)?$/.test(p)) return p;
            return p.charAt(0).toUpperCase() + p.slice(1);
        });
        return out.join(' ').replace(/\\s+\\(/g, ' (').replace(/\\s+/g, ' ');
    }
    if (lower.startsWith('claude')) {
        const norm = n.replace(/claude-(opus|sonnet|haiku)-(\\d+)-(\\d+)/i, 'claude-$1-$2.$3')
                      .replace(/claude-(\\d+)-(\\d+)/i, 'claude-$1.$2');
        const parts = norm.split('-');
        const out = parts.map((p, i) => {
            if (i === 0) return 'Claude';
            const pl = p.toLowerCase();
            if (pl === 'sonnet') return 'Sonnet';
            if (pl === 'opus') return 'Opus';
            if (pl === 'haiku') return 'Haiku';
            if (pl === 'thinking') return '(Thinking)';
            if (/^\\d+(\\.\\d+)?$/.test(p)) return p;
            return p.charAt(0).toUpperCase() + p.slice(1);
        });
        return out.join(' ').replace(/\\s+\\(/g, ' (').replace(/\\s+/g, ' ');
    }
    if (lower.startsWith('gpt')) {
        const parts = n.split('-');
        const out = parts.map((p, i) => {
            if (i === 0) return 'GPT';
            const pu = p.toUpperCase();
            if (pu === 'OSS') return 'OSS';
            if (p.toLowerCase() === 'medium') return '(Medium)';
            if (p.toLowerCase() === 'high') return '(High)';
            if (p.toLowerCase() === 'low') return '(Low)';
            if (/^\\d+[a-zA-Z]*$/.test(p)) return pu;
            return p.charAt(0).toUpperCase() + p.slice(1);
        });
        return out.join(' ').replace(/\\s+\\(/g, ' (').replace(/\\s+/g, ' ');
    }
    return n;
}

if (!activeAccountId || !accounts.find(a => a.id === activeAccountId)) {
    const current = accounts.find(a => a.isCurrent);
    activeAccountId = current ? current.id : (accounts[0] ? accounts[0].id : null);
}

// Ensure at least one account is selected
function ensureActive() {
    if (!accounts.find(a => a.id === activeAccountId) && accounts.length > 0) {
        activeAccountId = accounts[0].id;
    }
}
ensureActive();

window.addEventListener('message', event => {
    const m = event.data;
    if (m.command === 'groupsConfig') { 
        groupsConfig = m.config; 
        renderGroupsList(); 
    } else if (m.command === 'updateAccounts') {
        accounts = m.accounts;
        if (m.uiState) state.uiState = m.uiState;
        ensureActive();
        renderAll();
    } else if (m.command === 'serviceStatus') {
        serviceStatus = m.data;
        renderTrafficNetwork();
    }
});

function updateGlobalRefresh(val) {
    vscode.postMessage({ command: 'updateAutoRefreshInterval', interval: val });
}

function pctColor(p) { return p > 50 ? '#00ff66' : p > 20 ? '#d4a843' : '#ff2a2a'; }

function renderAll() {
    renderFocusNode();
    renderFleetGrid();
    renderTrafficNetwork();
    const countEl = document.getElementById('fleetCount');
    if (countEl) countEl.textContent = accounts.length;
}

function renderTrafficNetwork() {
    const el = document.getElementById('trafficStatusList');
    if (!el) return;
    const s = serviceStatus || {};
    const st = s.status || 'UNKNOWN';
    const label = s.label || 'Fetching...';
    const reports = s.reports || '';
    const fetchedAt = s.fetchedAt ? new Date(s.fetchedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '--:--';

    let color, icon, pulse;
    if (st === 'UP') {
        color = 'var(--green)'; icon = '●'; pulse = 'sg-pulse-green';
    } else if (st === 'POSSIBLE_OUTAGE') {
        color = 'var(--gold)'; icon = '◆'; pulse = 'sg-pulse-gold';
    } else if (st === 'LIKELY_OUTAGE') {
        color = 'var(--red)'; icon = '▲'; pulse = 'sg-pulse-red';
    } else if (st === 'MAINTENANCE') {
        color = '#7c6dd8'; icon = '⚙'; pulse = '';
    } else {
        color = 'var(--text-muted)'; icon = '○'; pulse = '';
    }

    el.innerHTML = \`
        <div class="sg-status-wrap">
            <div class="sg-orb-wrap">
                <div class="sg-orb \${pulse}" style="background:\${color};box-shadow:0 0 18px \${color},0 0 6px \${color}"></div>
            </div>
            <div class="sg-info">
                <div class="sg-label" style="color:\${color}">\${icon} \${label.toUpperCase()}</div>
                <div class="sg-sub">\${reports ? reports + ' &nbsp;·&nbsp; ' : ''}Updated \${fetchedAt}</div>
                <a class="sg-link" href="https://statusgator.com/services/google-antigravity" target="_blank" title="View full StatusGator report">↗ StatusGator</a>
            </div>
        </div>
    \`;

    // Dynamic API Status Logic based on model telemetry
    let gCount = 0, gTotal = 0, aCount = 0, aTotal = 0, isRl = false;
    accounts.forEach(acc => {
        if (acc.quota && acc.quota.is_error && acc.quota.error_status === 429) isRl = true;
        if (acc.quota && acc.quota.models && !acc.quota.is_error) {
            acc.quota.models.forEach(m => {
                const name = m.name.toLowerCase();
                if (name.includes('gemini')) { gTotal += m.percentage; gCount++; }
                else if (name.includes('claude') || name.includes('anthropic')) { aTotal += m.percentage; aCount++; }
            });
        }
    });

    function setBadge(id, count, total, err) {
        const b = document.getElementById(id);
        if (!b) return;
        const baseStyle = 'font-size:9px; padding:2px 6px; border-radius:4px; font-weight:bold; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;';
        if (err) {
            b.innerHTML = '<span style="font-size:8px;">▲</span> LIMIT';
            b.style = baseStyle + ' background:rgba(255,42,42,0.1); color:var(--red); border:1px solid var(--red);';
            return;
        }
        if (st === 'LIKELY_OUTAGE') {
            b.innerHTML = '<span style="font-size:8px;">▲</span> OUTAGE';
            b.style = baseStyle + ' background:rgba(255,42,42,0.1); color:var(--red); border:1px solid var(--red);';
            return;
        }
        if (st === 'POSSIBLE_OUTAGE') {
            b.innerHTML = '<span style="font-size:8px;">◆</span> UNSTABLE';
            b.style = baseStyle + ' background:rgba(212,168,67,0.1); color:var(--gold); border:1px solid var(--gold);';
            return;
        }
        if (st === 'MAINTENANCE') {
            b.innerHTML = '<span style="font-size:8px;">⚙</span> MAINT';
            b.style = baseStyle + ' background:rgba(124,109,216,0.1); color:#7c6dd8; border:1px solid #7c6dd8;';
            return;
        }
        if (count === 0) {
            b.innerHTML = '<span style="font-size:8px;">○</span> N/A';
            b.style = baseStyle + ' background:rgba(255,255,255,0.05); color:var(--text-muted); border:1px solid var(--text-muted);';
            return;
        }
        const avg = total / count;
        if (avg > 20) {
            b.innerHTML = '<span style="font-size:8px;">●</span> LIVE';
            b.style = baseStyle + ' background:rgba(0,255,102,0.1); color:var(--green); border:1px solid var(--green);';
        } else if (avg > 0) {
            b.innerHTML = '<span style="font-size:8px;">●</span> DEGRADED';
            b.style = baseStyle + ' background:rgba(212,168,67,0.1); color:var(--gold); border:1px solid var(--gold);';
        } else {
            b.innerHTML = '<span style="font-size:8px;">▲</span> EXHAUSTED';
            b.style = baseStyle + ' background:rgba(255,42,42,0.1); color:var(--red); border:1px solid var(--red);';
        }
    }
    setBadge('gemini-status-badge', gCount, gTotal, isRl);
    setBadge('anthropic-status-badge', aCount, aTotal, isRl);
}

function renderFocusNode() {
    const panel = document.getElementById('focusNode');
    const bdown = document.getElementById('modelsBreakdown');
    const acc = accounts.find(a => a.id === activeAccountId);
    if (!acc) {
        if (panel) panel.innerHTML = '<div style="color:var(--text-muted);text-align:center;margin-top:50px">NO ACCOUNT SELECTED</div>';
        if (bdown) bdown.innerHTML = '';
        return;
    }

    const isErr = acc.quota && acc.quota.is_error;
    const isRl = isErr && acc.quota.error_status === 429;
    let totalUsed = 0, totalLimit = 0, mCount = 0, health = 0, consumed = 0;

    if (acc.quota && acc.quota.models && !isErr) {
        let sum = 0;
        acc.quota.models.forEach(m => {
            mCount++;
            sum += m.percentage;
            totalUsed += m.used || 0;
            totalLimit += m.limit || 0;
        });
        health = mCount > 0 ? Math.round(sum / mCount) : 0;
        consumed = mCount > 0 ? (100 - health) : 0;
    }

    const tier = (acc.quota && acc.quota.tier) ? acc.quota.tier : 'UNKNOWN TIER';
    const displayName = acc.name || acc.email.split('@')[0];
    
    // Top Hero section
    let h = \`
        <div class="hero-top">
            <div class="hero-info">
                <div class="hero-name">\${displayName}\${acc.isCurrent ? '<span class="live-indicator">LIVE</span>' : ''}</div>
                <div class="hero-email">\${acc.email} | \${tier}</div>
            </div>
            <div class="hero-actions">
                \${!acc.isCurrent ? \`<button class="action-btn" onclick="doSwitch('\${acc.id}','\${acc.email}')">ACTIVATE</button>\` : ''}
                <button class="action-btn ghost" onclick="doRefresh('\${acc.id}')">REFRESH</button>
                <button class="action-btn ghost" onclick="doExportToken('\${acc.id}')">EXPORT</button>
                <button class="action-btn danger" onclick="doDelete('\${acc.id}','\${acc.email}')">DELETE</button>
            </div>
        </div>
        <div class="hero-stats">
            <div class="stat-box">
                <div class="stat-val" style="color:\${isErr ? 'var(--text-muted)' : pctColor(health)}">\${isErr ? 'ERR' : health + '%'}</div>
                <div class="stat-lbl">Integrity</div>
            </div>
            <div class="stat-box">
                <div class="stat-val" style="color:var(--cyan)">\${mCount}</div>
                <div class="stat-lbl">Models</div>
            </div>
            <div class="stat-box">
                <div class="stat-val" style="color:var(--gold)">\${consumed}%</div>
                <div class="stat-lbl">Used</div>
            </div>
        </div>
    \`;

    if (panel) panel.innerHTML = h;

    // Breakdown section
    let b = '<div class="card-title" style="display:flex;justify-content:space-between;align-items:center"><span>MODEL TELEMETRY</span><button class="action-btn ghost" style="padding:2px 8px;font-size:9px" onclick="openAllModels()">ALL MODELS</button></div>';

    if (mCount > 0 && !isErr) {
        b += '<div class="model-bars">';
        
        function getPriorityScore(name) {
            const n = name.toLowerCase();
            if (n.includes('5.5') || n.includes('5-5')) return 120;
            if (n.includes('5.0') || n.includes('5-0') || n.includes('5.')) return 110;
            if (n.includes('3.8') || n.includes('3-8')) return 105;
            if (n.includes('3.7') || n.includes('3-7')) return 102;
            if (n.includes('4.6') || n.includes('4-6')) return 100;
            if (n.includes('3.1') || n.includes('3-1')) return 100;
            if (n.includes('4.5') || n.includes('4-5')) return 95;
            if (n.includes('3.0') || n.includes('3-0')) return 90;
            if (n.includes('3.5') || n.includes('3-5')) return 85;
            if (n.includes('2.5') || n.includes('2-5')) return 80;
            return 50;
        }

        const cats = {
            opus: { match: (n) => n.includes('opus'), found: null, score: -1 },
            sonnet: { match: (n) => n.includes('sonnet'), found: null, score: -1 },
            pro: { match: (n) => n.includes('gemini') && n.includes('pro'), found: null, score: -1 },
            flash: { match: (n) => n.includes('gemini') && n.includes('flash'), found: null, score: -1 },
            gpt: { match: (n) => n.includes('gpt') || n.includes('oss'), found: null, score: -1 }
        };

        acc.quota.models.forEach(m => {
            const mName = m.name.toLowerCase();
            for (const key in cats) {
                if (cats[key].match(mName)) {
                    const sc = getPriorityScore(m.name);
                    if (!cats[key].found || sc > cats[key].score) {
                        cats[key].found = { ...m, displayName: getDisplayName(m.name) };
                        cats[key].score = sc;
                    }
                }
            }
        });

        const coreModels = [];
        for (const key in cats) {
            if (cats[key].found) { coreModels.push(cats[key].found); }
        }

        coreModels.forEach(m => {
            const c = pctColor(m.percentage);
            let rTime = 'Ready';
            if (m.reset_time_raw || m.reset_time) {
                const diff = new Date(m.reset_time_raw || m.reset_time).getTime() - Date.now();
                if (diff > 0) rTime = Math.floor(diff/3600000)+'h '+Math.floor((diff%3600000)/60000)+'m';
            }
            const cons = 100 - m.percentage;
            const usedVal = m.used || 0;
            const limitVal = m.limit || 0;
            const uStr = (usedVal > 0 || limitVal > 0) ? \`USAGE: \${usedVal.toLocaleString()} / \${limitVal.toLocaleString()} TOKENS\` : \`CONSUMED: \${cons}%\`;

            b += \`
            <div class="m-bar-wrap">
                <div class="m-bar-top"><span>\${m.displayName}</span><span style="color:\${c}">\${m.percentage}%</span></div>
                <div class="m-bar-track"><div class="m-bar-fill" style="width:\${m.percentage}%;background:\${c};color:\${c}"></div></div>
                <div class="m-bar-sub"><span>\${uStr}</span><span>Reset: \${rTime}</span></div>
            </div>\`;
        });
        b += '</div>';
    } else if (isErr) {
        b += \`<div style="text-align:center;padding:20px;color:var(--red);font-family:monospace">
            <div style="font-size:14px;margin-bottom:5px">[ HTTP \${isRl ? 429 : 500} ]</div>
            <div>\${isRl ? 'RATE LIMIT DETECTED' : 'TELEMETRY FAILURE'}</div>
            <div style="font-size:10px;margin-top:5px;color:var(--text-muted)">\${acc.quota.error_message || ''}</div>
        </div>\`;
    } else {
        b += \`<div style="text-align:center;padding:20px;color:var(--text-muted);font-family:monospace">AWAITING TELEMETRY DATA...</div>\`;
    }
    if (bdown) bdown.innerHTML = b;
}

function renderFleetGrid() {
    const grid = document.getElementById('topology');
    if (!grid) return;
    let h = '';
    accounts.forEach(acc => {
        const isCur = acc.isCurrent;
        const isSel = acc.id === activeAccountId;
        let p = 0;
        if (acc.quota && acc.quota.models && !acc.quota.is_error && acc.quota.models.length > 0) {
            p = Math.round(acc.quota.models.reduce((s,m)=>s+m.percentage,0)/acc.quota.models.length);
        }
        const isErr = acc.quota && acc.quota.is_error;
        const c = isErr ? 'var(--red)' : pctColor(p);
        const name = acc.name || acc.email.split('@')[0];

        h += \`
        <div class="t-node-v \${isSel ? 'active' : ''}" onclick="selectNode('\${acc.id}')">
            \${isCur ? \`<div class="t-indicator" style="background:var(--green);box-shadow:0 0 5px var(--green)"></div>\` : ''}
            <div class="t-ring" style="border-color:\${c};color:\${c}">\${isErr ? '!' : p}</div>
            <div class="t-info">
                <div class="t-name">\${name}</div>
                <div class="t-email">\${acc.email}</div>
            </div>
        </div>\`;
    });
    grid.innerHTML = h;
}

function selectNode(id) {
    activeAccountId = id;
    vscode.setState({ activeAccountId });
    renderAll();
}

// Actions
function doSwitch(id, em) { vscode.postMessage({ command: 'switch', accountId: id, email: em }); }
function doRefresh(id, silent=false) { vscode.postMessage({ command: 'refresh', accountId: id, silent }); }
function doRefreshAll() { vscode.postMessage({ command: 'refreshAll' }); }
function doAdd() { vscode.postMessage({ command: 'addAccount' }); }
function doDelete(id, em) { vscode.postMessage({ command: 'delete', accountId: id, email: em }); }
function doExportToken(id) { vscode.postMessage({ command: 'exportToken', accountId: id }); }
function doBatchExport() { vscode.postMessage({ command: 'batchExportTokens' }); }
function doSafeClean() { vscode.postMessage({ command: 'safeClean' }); }

function openTokenModal() { document.getElementById('tokenModal').classList.add('vis'); document.getElementById('tokenInput').value = ''; }
function closeTokenModal() { document.getElementById('tokenModal').classList.remove('vis'); }
function submitToken() { const t = document.getElementById('tokenInput').value.trim(); if(t) vscode.postMessage({ command: 'loginWithToken', token: t }); closeTokenModal(); }

function openImportModal() { document.getElementById('importModal').classList.add('vis'); document.getElementById('importInput').value = ''; }
function closeImportModal() { document.getElementById('importModal').classList.remove('vis'); }
function submitImport() { const j = document.getElementById('importInput').value.trim(); if(j) vscode.postMessage({ command: 'batchImportTokens', jsonText: j }); closeImportModal(); }

// UI Controls
function openAllModels() {
    const acc = accounts.find(a => a.id === activeAccountId);
    if (!acc || !acc.quota || !acc.quota.models) return;
    
    let html = '';
    acc.quota.models.forEach(m => {
        const c = pctColor(m.percentage);
        let rTime = 'Ready';
        if (m.reset_time_raw || m.reset_time) {
            const diff = new Date(m.reset_time_raw || m.reset_time).getTime() - Date.now();
            if (diff > 0) rTime = Math.floor(diff/3600000)+'h '+Math.floor((diff%3600000)/60000)+'m';
        }
        const cons = 100 - m.percentage;
        const usedVal = m.used || 0;
        const limitVal = m.limit || 0;
        const uStr = (usedVal > 0 || limitVal > 0) ? \`\${usedVal.toLocaleString()} / \${limitVal.toLocaleString()} tokens\` : \`\${cons}% used\`;

        html += \`
        <div class="m-bar-wrap" style="margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">
            <div class="m-bar-top"><span>\${getDisplayName(m.name)}</span><span style="color:\${c}">\${m.percentage}%</span></div>
            <div class="m-bar-track"><div class="m-bar-fill" style="width:\${m.percentage}%;background:\${c};color:\${c}"></div></div>
            <div class="m-bar-sub"><span>\${uStr}</span><span>Reset: \${rTime}</span></div>
        </div>\`;
    });
    
    document.getElementById('allModelsList').innerHTML = html;
    document.getElementById('allModelsModal').classList.add('vis');
}
function closeAllModels() {
    document.getElementById('allModelsModal').classList.remove('vis');
}

// Groups
function getAllModels() { 
    const m=[]; 
    accounts.forEach(a=>{
        if(a.quota&&a.quota.models) {
            a.quota.models.forEach(x=>{
                if(!m.find(y=>y.name===x.name)) m.push({name:x.name, resetTime:x.reset_time_raw||x.reset_time||''});
            });
        }
    }); 
    return m; 
}

function getGroupScopeModels() {
    if (groupModelScope === 'current') {
        const curAcc = accounts.find(a => a.id === activeAccountId);
        if (curAcc && curAcc.quota && curAcc.quota.models && curAcc.quota.models.length > 0) {
            return curAcc.quota.models.map(m => ({ name: m.name, resetTime: m.reset_time_raw || m.reset_time || '' }));
        }
    }
    return getAllModels();
}

function setGroupModelScope(val) {
    groupModelScope = val;
    renderGroupsList();
}

function getGroupedModels() { 
    const s=new Set(); 
    if(groupsConfig && groupsConfig.groups) {
        groupsConfig.groups.forEach(g=>g.models.forEach(m=>s.add(m))); 
    }
    return s; 
}

function openGroups() { 
    document.getElementById('groupModal').classList.add('vis'); 
    renderGroupsList(); 
}
function closeGroups() { document.getElementById('groupModal').classList.remove('vis'); }
function autoGroup() { vscode.postMessage({ command: 'autoGroup', models: getGroupScopeModels() }); }
function addGroup() { vscode.postMessage({ command: 'addGroup', groupName: 'New Route' }); }
function deleteGroup(id) { vscode.postMessage({ command: 'deleteGroup', groupId: id }); }
function updateGroupName(id, name) { vscode.postMessage({ command: 'updateGroupName', groupId: id, newName: name }); }
function addModelToGroup(gid, mn) { vscode.postMessage({ command: 'addModelToGroup', groupId: gid, modelName: mn }); }
function removeModelFromGroup(gid, mn) { vscode.postMessage({ command: 'removeModelFromGroup', groupId: gid, modelName: mn }); }
function saveGroups() { vscode.postMessage({ command: 'saveGroups', config: groupsConfig }); closeGroups(); }

function renderGroupsList() {
    const c = document.getElementById('groupsList'), all = getGroupScopeModels(), used = getGroupedModels();
    if (!c) return;
    if (!groupsConfig || !groupsConfig.groups || groupsConfig.groups.length === 0) { 
        c.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-family:monospace">NO GROUPS DEFINED</div>'; 
        return; 
    }
    c.innerHTML = groupsConfig.groups.map(g => '<div class="gc"><div class="gc-head">'
        + '<input type="text" class="gc-input" value="' + g.name + '" onchange="updateGroupName(\\'' + g.id + '\\',this.value)" onclick="event.stopPropagation()">'
        + '<button class="action-btn danger ghost" style="padding:4px 8px;font-size:10px" onclick="deleteGroup(\\'' + g.id + '\\')">DEL</button></div>'
        + '<div class="gc-tags">' + g.models.map(mn => '<span class="gc-tag">' + getDisplayName(mn) + '<span class="gc-rm" onclick="removeModelFromGroup(\\'' + g.id + '\\',\\'' + mn + '\\')">&times;</span></span>').join('')
        + '<button class="gc-add" onclick="toggleDD(\\'' + g.id + '\\',event)">+ ADD</button>'
        + '<div class="gc-dd" id="dd-' + g.id + '">' + all.filter(m => !g.models.includes(m.name)).map(m => '<div class="gc-dd-item' + (used.has(m.name)&&!g.models.includes(m.name)?' disabled':'') + '" onclick="' + (used.has(m.name)&&!g.models.includes(m.name)?'':(\"addModelToGroup('\"+g.id+\"','\"+m.name+\"')\")) + '">' + getDisplayName(m.name) + '</div>').join('') + '</div>'
        + '</div></div>').join('');
}

function toggleDD(gid, ev) {
    ev.stopPropagation();
    const dd = document.getElementById('dd-' + gid);
    if (!dd) return;
    document.querySelectorAll('.gc-dd').forEach(d => { if(d.id !== 'dd-'+gid) d.classList.remove('show'); });
    const r = ev.currentTarget.getBoundingClientRect();
    dd.style.top = (r.bottom+2)+'px'; dd.style.left = r.left+'px';
    dd.classList.toggle('show');
}
document.addEventListener('click', () => { document.querySelectorAll('.gc-dd').forEach(d => d.classList.remove('show')); });

// Init
setTimeout(() => {
    renderAll();
    const sel = document.getElementById('autoRefreshGlobal');
    if (sel) {
        sel.value = 'INTERVAL_PLACEHOLDER';
    }
}, 100);
`;
}
