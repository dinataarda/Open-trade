/**
 * SMART TRADE AI - Core Application Logic
 * Phase 1 Corrected: Consolidated Structure with 100% Original Logic Restored
 */

const App = {  
    s: {  
        ai: {  
            cat: 'futures', pair: 'BTCUSDT',  
            cache: {}, // Akan diisi dari localStorage di load()
            cfg: { provider: 'Gemini', apiKey: '', model: 'gemini-1.5-flash' }
        },  
        sim: {  
            cat: 'futures', asset: 'BTCUSDT',  
            bal: 10000,  
            marginMode: 'cross',  
            leverage: 20,  
            orderType: 'market',  
            pos: [],  
            orders: [],  
            hist: [],  
            prices: { 'BTCUSDT': 0, 'ETHUSDT': 0, 'SOLUSDT': 0, 'BNBUSDT': 0, 'XRPUSDT': 0, 'ADAUSDT': 0, 'NVDA': 140, 'MSFT': 420, 'GOOGL': 180, 'AMD': 160, 'TSM': 150, 'PLTR': 25, 'MSTR': 1500 },  
            assets: {  
                futures: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT'],  
                spot: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],  
                stocks: ['NVDA', 'MSFT', 'GOOGL', 'AMD', 'TSM', 'PLTR', 'MSTR']  
            },
            ws: null, lastSave: Date.now()
        },  
        sys: { chartVisible: true, wsReconnectAttempts: 0, stockInterval: null, MAINTENANCE_MARGIN_RATE: 0.005, FEE_RATE: 0.0004, abortController: null }  
    },  

    // --- UTILITIES & FORMATTING ---
    $: id => document.getElementById(id),  
    num: (n, d=2) => new Intl.NumberFormat('en-US', {minimumFractionDigits:d, maximumFractionDigits:d}).format(n || 0),  
    fp: (num) => Math.round(num * 1e8) / 1e8,
    safeParse: (data, fallback) => { try { return data ? JSON.parse(data) : fallback; } catch (e) { return fallback; } },

    toast: (msg, type='info') => {  
        let w = App.$('toastWrap');
        if(!w) return;
        let t = document.createElement('div');  
        let ic = type==='up'?'check-circle':(type==='down'?'alert-octagon':'info');  
        let c = type==='up'?'var(--up)':(type==='down'?'var(--down)':'var(--accent)');  
        t.className = 'toast'; 
        t.innerHTML = `<i data-lucide="${ic}" style="color:${c};"></i> <span></span>`;  
        t.querySelector('span').textContent = msg;
        w.appendChild(t); 
        if(window.lucide) lucide.createIcons({root:t});  
        setTimeout(()=>{ t.style.opacity = '0'; setTimeout(()=>t.remove(), 300); }, 3500);  
    },  

    // --- STORAGE MANAGEMENT ---
    save: () => {  
        try {
            localStorage.setItem('st_sim_bal', App.fp(App.s.sim.bal));  
            localStorage.setItem('st_sim_pos', JSON.stringify(App.s.sim.pos));  
            localStorage.setItem('st_sim_ord', JSON.stringify(App.s.sim.orders));  
            localStorage.setItem('st_sim_hist', JSON.stringify(App.s.sim.hist)); 
            localStorage.setItem('st_sim_lev', App.s.sim.leverage);
            localStorage.setItem('st_sim_margin', App.s.sim.marginMode); 
            localStorage.setItem('st_ai_cfg', JSON.stringify(App.s.ai.cfg));
            localStorage.setItem('st_ai_c', JSON.stringify(App.s.ai.cache));
        } catch (e) {
            App.s.sim.hist = App.s.sim.hist.slice(0, 50);
            localStorage.setItem('st_sim_hist', JSON.stringify(App.s.sim.hist));
        }
    },  

    load: () => {
        App.s.sim.bal = parseFloat(localStorage.getItem('st_sim_bal')) || 10000;
        App.s.sim.pos = App.safeParse(localStorage.getItem('st_sim_pos'), []);
        App.s.sim.orders = App.safeParse(localStorage.getItem('st_sim_ord'), []);
        App.s.sim.hist = App.safeParse(localStorage.getItem('st_sim_hist'), []);
        App.s.sim.leverage = parseInt(localStorage.getItem('st_sim_lev')) || 20;
        App.s.sim.marginMode = localStorage.getItem('st_sim_margin') || 'cross';
        App.s.ai.cfg = App.safeParse(localStorage.getItem('st_ai_cfg'), { provider: 'Gemini', apiKey: '', model: 'gemini-1.5-flash' });
        App.s.ai.cache = App.safeParse(localStorage.getItem('st_ai_c'), {});
    },

    // --- NAVIGATION ---
    nav: (t) => {  
        document.querySelectorAll('.view, .nav-item').forEach(e => e.classList.remove('active'));  
        if(App.$(`view-${t}`)) App.$(`view-${t}`).classList.add('active');  
        let navItem = document.querySelector(`.nav-item[data-target="${t}"]`);
        if(navItem) navItem.classList.add('active');  
        window.scrollTo({top: 0, behavior: 'smooth'}); 
        if(t==='portfolio') App.rPortfolio();  
        if(t==='sim') {
            App.calcOrder();
            App.updateSimUI();
            App.switchViewMode(App.s.sys.chartVisible ? 'chart' : 'overview');
        }
    },

    switchViewMode: (mode) => {
        App.s.sys.chartVisible = (mode === 'chart');
        if(App.$('viewModeOverview')) App.$('viewModeOverview').style.display = mode === 'chart' ? 'none' : 'block';
        if(App.$('viewModeChart')) App.$('viewModeChart').style.display = mode === 'chart' ? 'block' : 'none';
        if(App.$('toggle-chart')) App.$('toggle-chart').classList.toggle('active', mode === 'chart');
        if(App.$('toggle-overview')) App.$('toggle-overview').classList.toggle('active', mode === 'overview');
        if(mode === 'chart') { App.loadChart(App.s.sim.asset); }
    },

    // --- MARKET DATA ENGINE ---
    startEngine: () => {  
        App.initWebSocket();
        App.fetchStocksData();
        if(App.s.sys.stockInterval) clearInterval(App.s.sys.stockInterval);
        App.s.sys.stockInterval = setInterval(App.fetchStocksData, 15000);   
    },  
    
    initWebSocket: () => {
        if(App.s.sim.ws) App.s.sim.ws.close();
        if (!navigator.onLine) return;
        let streams = [...App.s.sim.assets.futures, ...App.s.sim.assets.spot].map(s => s.toLowerCase() + '@ticker').join('/');
        App.s.sim.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);
        App.s.sim.ws.onmessage = (event) => {
            try {
                let data = JSON.parse(event.data);
                if(data.s && data.c) { 
                    App.s.sim.prices[data.s] = parseFloat(data.c); 
                    App.triggerTickUpdates(); 
                }
            } catch(e) {}
        };
        App.s.sim.ws.onclose = () => { if(navigator.onLine) setTimeout(App.initWebSocket, 5000); };
    },

    fetchStocksData: async () => {
        if(!navigator.onLine) return;
        try {
            const symbols = App.s.sim.assets.stocks.join(',');
            const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`)}`);
            const data = await res.json();
            const parsed = App.safeParse(data.contents, null);
            if(parsed?.quoteResponse?.result) {
                parsed.quoteResponse.result.forEach(stock => { App.s.sim.prices[stock.symbol] = stock.regularMarketPrice; });
                App.triggerTickUpdates();
            }
        } catch (e) {}
    },

    triggerTickUpdates: () => {
        App.processOrders();  
        App.processPositions();  
        let now = Date.now();
        if (now - App.s.sim.lastSave > 500) {
            requestAnimationFrame(() => {
                if(App.$('view-sim')?.classList.contains('active')) App.updateSimUI();  
                if(App.$('view-portfolio')?.classList.contains('active')) App.updatePortUI();
            });
            App.s.sim.lastSave = now;
        }
    },

    // --- TRADING OPERATIONS ---
    processOrders: () => { 
        if(App.s.sim.orders.length === 0) return;
        let triggered = [];
        App.s.sim.orders.forEach(o => {
            let p = App.s.sim.prices[o.asset];
            if(p > 0 && ((o.side === 'LONG' && p <= o.targetPrice) || (o.side === 'SHORT' && p >= o.targetPrice))) {
                triggered.push(o);
                App.openPosition(o.asset, o.cat, o.side, o.margin, o.leverage, p, o.tp, o.sl, 'LIMIT_FILLED');
            }
        });
        if(triggered.length > 0) {
            App.s.sim.orders = App.s.sim.orders.filter(o => !triggered.includes(o));
            App.save(); App.rPositions();
        }
    },
    
    processPositions: () => {
        if(App.s.sim.pos.length === 0) return;
        let closed = [];
        App.s.sim.pos.forEach(p => {
            let curP = App.s.sim.prices[p.asset];
            if(!curP) return;
            let pnlData = App.calcPnL(p, curP);
            if(p.cat === 'futures' && pnlData.roe <= -95) closed.push({id: p.id, price: curP, reason: 'LIQUIDATED'});
            else if(p.tp && ((p.side === 'LONG' && curP >= p.tp) || (p.side === 'SHORT' && curP <= p.tp))) closed.push({id: p.id, price: curP, reason: 'TAKE_PROFIT'});
            else if(p.sl && ((p.side === 'LONG' && curP <= p.sl) || (p.side === 'SHORT' && curP >= p.sl))) closed.push({id: p.id, price: curP, reason: 'STOP_LOSS'});
        });
        closed.forEach(c => App.closePosition(c.id, c.price, c.reason));
        if(closed.length > 0) App.rPositions();
    },

    calcPnL: (pos, curP) => {
        let diff = pos.side === 'LONG' ? (curP - pos.entryPrice) : (pos.entryPrice - curP);
        let pnl = diff * pos.size;
        let roe = pos.margin > 0 ? (pnl / pos.margin) * 100 : 0;
        return { pnl: App.fp(pnl), roe: App.fp(roe) };
    },

    executeTrade: (side) => {
        let sizeInput = parseFloat(App.$('oSize')?.value) || 0;
        let curP = App.s.sim.prices[App.s.sim.asset];
        if(!curP) return App.toast('Menunggu data harga...', 'down');
        if(sizeInput <= 0 || sizeInput > App.s.sim.bal) return App.toast('Input margin tidak valid.', 'down');

        if(App.s.sim.orderType === 'limit') {
            let limitPrice = parseFloat(App.$('oPrice')?.value) || 0;
            if(limitPrice <= 0) return App.toast('Harga limit tidak valid.', 'down');
            App.s.sim.orders.push({ id: Date.now().toString(), asset: App.s.sim.asset, cat: App.s.sim.cat, side, margin: sizeInput, leverage: App.s.sim.leverage, targetPrice: limitPrice, tp: parseFloat(App.$('oTP').value), sl: parseFloat(App.$('oSL').value), date: Date.now() });
            App.s.sim.bal = App.fp(App.s.sim.bal - sizeInput);
            App.toast(`Limit ${side} dipasang`, 'up');
        } else {
            App.openPosition(App.s.sim.asset, App.s.sim.cat, side, sizeInput, App.s.sim.cat === 'futures' ? App.s.sim.leverage : 1, curP, parseFloat(App.$('oTP').value), parseFloat(App.$('oSL').value), 'MARKET');
        }
        App.save(); App.rPositions(); App.calcOrder();
    },

    openPosition: (asset, cat, side, margin, lev, price, tp, sl, reason) => {
        let posSize = (margin * lev) / price;
        let fee = App.fp((margin * lev) * App.s.sys.FEE_RATE);
        let mmValue = price * App.s.sys.MAINTENANCE_MARGIN_RATE;
        let estLiq = side === 'LONG' ? price - ((margin / posSize) - mmValue) : price + ((margin / posSize) - mmValue);
        if(reason === 'MARKET') App.s.sim.bal = App.fp(App.s.sim.bal - margin);
        App.s.sim.pos.push({ id: Date.now().toString(), asset, cat, side, margin, leverage: lev, entryPrice: price, size: posSize, tp, sl, fee, liqPrice: Math.max(0, estLiq), unrealizedPnL: -fee, date: Date.now() });
        App.toast(`${side} ${asset} Berhasil`, 'up');
    },

    closePosition: (id, execPrice = null, reason = 'MANUAL') => {
        let idx = App.s.sim.pos.findIndex(p => p.id === id);
        if(idx === -1) return;
        let p = App.s.sim.pos[idx];
        let price = execPrice || App.s.sim.prices[p.asset];
        let pnlData = App.calcPnL(p, price);
        let finalPnL = App.fp(pnlData.pnl - p.fee); 
        App.s.sim.bal = App.fp(App.s.sim.bal + p.margin + finalPnL);
        App.s.sim.hist.unshift({ asset: p.asset, side: p.side, entry: p.entryPrice, exit: price, pnl: finalPnL, date: Date.now() });
        App.s.sim.pos.splice(idx, 1);
        App.save(); App.rPositions(); App.toast(`Posisi ditutup (${reason})`, 'info');
    },

    cancelOrder: (id) => {
        let idx = App.s.sim.orders.findIndex(o => o.id === id);
        if(idx > -1) {
            App.s.sim.bal = App.fp(App.s.sim.bal + App.s.sim.orders[idx].margin);
            App.s.sim.orders.splice(idx, 1);
            App.save(); App.rPositions(); App.toast('Order dibatalkan', 'info');
        }
    },

    // --- UI RENDERING (CORE RESTORED) ---
    setSimCat: (c) => {  
        App.s.sim.cat = c;  
        document.querySelectorAll('#view-sim .chip').forEach(el=>el.classList.remove('active'));  
        if(App.$(`st-${c}`)) App.$(`st-${c}`).classList.add('active');  
        
        let h = ''; 
        App.s.sim.assets[c].forEach(a => { 
            h += `<div class="chip" onclick="App.setSimAsset('${a}')">${a.replace('USDT','')}</div>`; 
        });  
        if(App.$('simAssetList')) App.$('simAssetList').innerHTML = h;  
        
        App.setSimAsset(App.s.sim.assets[c][0]);  
        
        if(App.$('uiLeverage')) App.$('uiLeverage').style.display = c==='futures'?'inline-flex':'none';  
        if(App.$('uiMarginMode')) App.$('uiMarginMode').style.display = c==='futures'?'inline-flex':'none';  
        if(App.$('btnSell')) App.$('btnSell').style.display = c==='spot'?'none':'flex';  
        if(App.$('uiLiqRow')) App.$('uiLiqRow').style.display = c==='futures'?'flex':'none';  
    },  

    setSimAsset: (a) => {  
        App.s.sim.asset = a;  
        document.querySelectorAll('#simAssetList .chip').forEach(el => {
            el.classList.toggle('active', el.textContent.trim() === a.replace('USDT',''));
        });
        if(App.$('simAssetLabel')) App.$('simAssetLabel').textContent = a;  
        App.calcOrder();  
        if(App.s.sys.chartVisible) App.loadChart(a);
    },  

    loadChart: (sym) => {  
        let ex = App.s.sim.cat === 'stocks' ? 'NASDAQ%3A' : 'BINANCE%3A';  
        if (sym === 'TSM') ex = 'NYSE%3A'; 
        if(App.$('tvFrame')) {
            App.$('tvFrame').src = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${ex}${sym}&interval=15&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=000000&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FJakarta`;  
        }
    },  

    updateSimUI: () => { 
        let p = App.s.sim.prices[App.s.sim.asset];
        if(!p) return;
        if(App.$('simPriceDisplay')) App.$('simPriceDisplay').textContent = App.num(p, 4);
        if(App.$('simMarkPrice')) App.$('simMarkPrice').textContent = App.num(p, 4);

        App.s.sim.pos.forEach(pos => {
            let pnlEl = App.$(`pnl_${pos.id}`), roeEl = App.$(`roe_${pos.id}`);
            if(pnlEl && roeEl) {
                let cur = App.s.sim.prices[pos.asset];
                if (!cur) return;
                let calc = App.calcPnL(pos, cur);
                pnlEl.textContent = `${calc.pnl >= 0 ? '+' : ''}${App.num(calc.pnl)}`;
                pnlEl.className = `font-mono text-md ${calc.pnl >= 0 ? 'text-up' : 'text-down'}`;
                roeEl.textContent = `${calc.roe >= 0 ? '+' : ''}${App.num(calc.roe)}%`;
                roeEl.className = calc.roe >= 0 ? 'text-up' : 'text-down';
            }
        });
    },

    rPositions: () => {
        if(App.$('cntPos')) App.$('cntPos').textContent = App.s.sim.pos.length;
        if(App.$('cntOrd')) App.$('cntOrd').textContent = App.s.sim.orders.length;
        
        let hPos = '';
        App.s.sim.pos.forEach(p => {
            let isLong = p.side === 'LONG';
            let cur = App.s.sim.prices[p.asset] || p.entryPrice;
            let calc = App.calcPnL(p, cur);
            hPos += `<div class="card" style="margin-bottom:12px; padding:12px;">
                <div class="flex-between mb-2">
                    <div><span class="badge" style="background:${isLong?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)'}; color:${isLong?'var(--up)':'var(--down)'}; border:none;">${p.side} ${p.leverage}x</span><span class="font-bold text-md" style="margin-left:8px;">${p.asset}</span></div>
                    <div style="text-align:right;"><div id="pnl_${p.id}" class="font-mono text-md ${calc.pnl >= 0 ? 'text-up' : 'text-down'}">${calc.pnl >= 0 ? '+' : ''}${App.num(calc.pnl)}</div><div id="roe_${p.id}" class="text-xs ${calc.roe >= 0 ? 'text-up' : 'text-down'}">${calc.roe >= 0 ? '+' : ''}${App.num(calc.roe)}%</div></div>
                </div>
                <div class="flex-between text-xs text-sec mb-2" style="background:var(--bg-base); padding:8px; border-radius:8px;">
                    <div><div>Entry</div><div class="text-pri font-mono">${App.num(p.entryPrice, 4)}</div></div>
                    <div><div>Liq.</div><div class="text-warning font-mono">${p.cat==='futures'?App.num(p.liqPrice, 4):'--'}</div></div>
                    <div><div>Margin</div><div class="text-pri font-mono">${App.num(p.margin)}</div></div>
                </div>
                <button class="btn" style="padding:8px; background:transparent; border-color:var(--border);" onclick="App.closePosition('${p.id}')">Tutup Posisi</button>
            </div>`;
        });
        if(App.$('listPositions')) App.$('listPositions').innerHTML = hPos || '<div class="text-center text-sec text-xs" style="padding:40px 0;">Tidak ada posisi terbuka.</div>';

        let hOrd = '';
        App.s.sim.orders.forEach(o => {
            hOrd += `<div class="card" style="margin-bottom:12px; padding:12px;">
                <div class="flex-between mb-2">
                    <div><span class="badge">${o.side} Limit</span><span class="font-bold" style="margin-left:8px;">${o.asset}</span></div>
                    <button class="btn" style="width:auto; padding:4px 12px;" onclick="App.cancelOrder('${o.id}')">Cancel</button>
                </div>
                <div class="flex-between text-xs text-sec"><span>Target: <span class="text-pri font-mono">${App.num(o.targetPrice)}</span></span><span>Margin: <span class="text-pri font-mono">${App.num(o.margin)}</span></span></div>
            </div>`;
        });
        if(App.$('listOrders')) App.$('listOrders').innerHTML = hOrd || '<div class="text-center text-sec text-xs" style="padding:40px 0;">Tidak ada order tertunda.</div>';
    },

    // --- AI MENTOR OPERATIONS ---
    setAiCat: (c) => {
        App.s.ai.cat = c;
        document.querySelectorAll('#aiCatTabs .chip').forEach(el => el.classList.remove('active'));
        if(App.$(`ai-cat-${c}`)) App.$(`ai-cat-${c}`).classList.add('active');
        let h = '';
        App.s.sim.assets[c].forEach(a => {
            h += `<div class="chip" id="ai-pair-${a}" onclick="App.setAiPair('${a}')">${a.replace('USDT','')}</div>`;
        });
        if(App.$('aiPairTabs')) App.$('aiPairTabs').innerHTML = h;
        if(App.s.sim.assets[c].length > 0) App.setAiPair(App.s.sim.assets[c][0]);
    },

    setAiPair: (a) => {
        App.s.ai.pair = a;
        document.querySelectorAll('#aiPairTabs .chip').forEach(el => el.classList.toggle('active', el.id === `ai-pair-${a}`));
        document.querySelectorAll('.act-pair').forEach(el => el.textContent = a);
        // Analisis DSS logic will follow in next phases
    },

    // --- PORTFOLIO & STATS ---
    rPortfolio: () => { App.updatePortUI(); App.calcStats(); App.rHistory(); },

    updatePortUI: () => {
        let upnl = 0;
        App.s.sim.pos.forEach(p => { let cur = App.s.sim.prices[p.asset]; if(cur) upnl += App.calcPnL(p, cur).pnl; });
        let eq = App.s.sim.bal + upnl;
        if(App.$('ptEquity')) App.$('ptEquity').textContent = App.num(eq);
        if(App.$('ptBal')) App.$('ptBal').textContent = App.num(App.s.sim.bal);
        let ptUpnl = App.$('ptUpnl');
        if(ptUpnl) { 
            ptUpnl.textContent = `${upnl >= 0 ? '+' : ''}${App.num(upnl)}`; 
            ptUpnl.className = `font-mono text-md ${upnl >= 0 ? 'text-up' : 'text-down'}`; 
        }
    },

    calcStats: () => {
        let h = App.s.sim.hist, total = h.length, wins = h.filter(x => x.pnl > 0).length, wr = total > 0 ? (wins / total) * 100 : 0;
        if(App.$('stWr')) App.$('stWr').textContent = `${wr.toFixed(1)}%`;
        if(App.$('stTrd')) App.$('stTrd').textContent = total;
    },

    rHistory: () => {
        let html = '';
        App.s.sim.hist.forEach(h => {
            let isWin = h.pnl >= 0;
            html += `<div class="card" style="margin-bottom:12px; padding:12px;">
                <div class="flex-between">
                    <div><span class="badge">${h.side}</span> <span class="font-bold">${h.asset}</span></div>
                    <div class="font-mono ${isWin?'text-up':'text-down'}">${isWin?'+':''}${App.num(h.pnl)}</div>
                </div>
            </div>`;
        });
        if(App.$('listHistory')) App.$('listHistory').innerHTML = html || '<div class="text-center text-sec text-xs" style="padding:40px 0;">Belum ada histori.</div>';
    },

    // --- SYSTEM & PWA ---
    calcOrder: () => {
        let size = parseFloat(App.$('oSize')?.value) || 0;
        if(App.$('uiAvailBal')) App.$('uiAvailBal').textContent = App.num(App.s.sim.bal);
        if(App.$('uiCost')) App.$('uiCost').textContent = `${App.num(size)} USDT`;
    },

    init: () => {  
        App.load();
        if(window.lucide) window.lucide.createIcons();
        
        // Restore Default State
        App.setAiCat('futures');
        App.setSimCat('futures');  
        App.nav('sim'); 
        
        App.startEngine();  
        console.log("SMART TRADE AI: System Initialized with Full Logic.");
    }  
};  

// Global Exposure
window.App = App;

// Event Listeners
window.addEventListener('offline', () => App.toast('Offline Mode', 'down'));
window.addEventListener('online', () => { App.toast('Online Mode', 'up'); App.initWebSocket(); });

// Immediate Execution
if (document.readyState === 'complete') {
    App.init();
} else {
    window.addEventListener('load', App.init);
}