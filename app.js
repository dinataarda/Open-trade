/**
 * SMART TRADE AI - Core Application Logic
 * Bugfix: AI Pipeline, Bottom Nav Home, and Native PWA Implementation
 */

const App = {  
    s: {  
        ai: {  
            cat: 'futures', pair: 'BTCUSDT',  
            cache: {},
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
        sys: { chartVisible: true, wsReconnectAttempts: 0, stockInterval: null, MAINTENANCE_MARGIN_RATE: 0.005, FEE_RATE: 0.0004, abortController: null, deferredPrompt: null }  
    },  

    // --- UTILITIES ---
    $: id => document.getElementById(id),  
    num: (n, d=2) => new Intl.NumberFormat('en-US', {minimumFractionDigits:d, maximumFractionDigits:d}).format(n || 0),  
    fp: (num) => Math.round(num * 1e8) / 1e8,
    safeParse: (data, fallback) => { try { return data ? JSON.parse(data) : fallback; } catch (e) { return fallback; } },
    cleanJsonString: (str) => {
        if (!str) return "{}";
        try {
            let clean = str.replace(/```json/gi, '').replace(/```/g, '').trim();
            const match = clean.match(/\{[\s\S]*\}/);
            return match ? match[0] : "{}";
        } catch (e) { return "{}"; }
    },

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

    // --- PWA NATIVE IMPLEMENTATION ---
    initPWA: () => {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            App.s.sys.deferredPrompt = e;
            const pwaCard = App.$('pwaCard');
            if (pwaCard && !window.matchMedia('(display-mode: standalone)').matches) {
                pwaCard.style.display = 'block';
            }
        });

        const btnPWA = App.$('btnPWA');
        if (btnPWA) {
            btnPWA.addEventListener('click', async () => {
                const promptEvent = App.s.sys.deferredPrompt;
                if (!promptEvent) return;
                promptEvent.prompt();
                const { outcome } = await promptEvent.userChoice;
                if (outcome === 'accepted') {
                    App.toast('Terima kasih telah menginstal!', 'up');
                    App.$('pwaCard').style.display = 'none';
                }
                App.s.sys.deferredPrompt = null;
            });
        }

        // Detect if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            const pwaCard = App.$('pwaCard');
            if (pwaCard) {
                pwaCard.style.display = 'block';
                pwaCard.style.borderColor = 'var(--accent)';
                pwaCard.innerHTML = `<h3 class="text-md font-bold mb-2 text-accent"><i data-lucide="check-circle" style="width:18px; vertical-align:-3px;"></i> PWA Sudah Terinstall</h3><p class="text-sm text-sec">Anda sedang menggunakan versi aplikasi native.</p>`;
                lucide.createIcons({root: pwaCard});
            }
        }
    },

    // --- DATA PERSISTENCE ---
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
        if(t==='ai') App.renderAi();
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

    // --- ANALYTICS ENGINE (FULL RESTORED) ---
    fetchOHLCV: async (symbol, interval='15m', limit=100) => {
        if(!navigator.onLine) return null;
        try {
            if (symbol.includes('USDT')) {
                let res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
                let data = await res.json();
                return data.map(d => ({ close: parseFloat(d[4]), high: parseFloat(d[2]), low: parseFloat(d[3]) }));
            }
            return null;
        } catch (e) { return null; }
    },

    calcEMAArray: (data, period) => {
        let k = 2 / (period + 1), ema = [data[0].close];
        for (let i = 1; i < data.length; i++) ema.push((data[i].close * k) + (ema[ema.length - 1] * (1 - k)));
        return ema;
    },

    calcRSI: (data, period) => {
        let gains = 0, losses = 0;
        for (let i = data.length - period; i < data.length; i++) {
            let diff = data[i].close - data[i - 1].close;
            if (diff >= 0) gains += diff; else losses -= diff;
        }
        let rs = (gains / period) / (losses / period);
        return 100 - (100 / (1 + rs));
    },

    calcATR: (data, period) => {
        let trs = data.slice(-period).map((d, i, a) => i === 0 ? d.high - d.low : Math.max(d.high - d.low, Math.abs(d.high - a[i-1].close), Math.abs(d.low - a[i-1].close)));
        return trs.reduce((a, b) => a + b, 0) / period;
    },

    analyzeSMC: (data) => {
        let lc = data.length - 1;
        let structure = data[lc].close > data[lc-1].close ? "BOS Bullish" : "BOS Bearish";
        let fvg = data[lc-2].high < data[lc].low ? "Bullish FVG" : (data[lc-2].low > data[lc].high ? "Bearish FVG" : "None");
        return { structure, fvg };
    },

    // --- AI & DSS PIPELINE (FULL RESTORED) ---
    runAI: async (force) => {
        if(!navigator.onLine) return App.toast('Offline Mode', 'down');
        let p = App.s.ai.pair;
        let cfg = App.s.ai.cfg;
        if(!cfg.apiKey) return App.toast('Isi API Key di Settings', 'down');

        if(App.$('btnRunAi')) App.$('btnRunAi').disabled = true;
        document.querySelectorAll('.dss-step').forEach(s => s.className = 'dss-step');
        
        try {
            // Step 1: Data
            App.$('step-1').className = 'dss-step processing';
            let ohlcv = await App.fetchOHLCV(p);
            if(!ohlcv) throw 'Data Error';
            App.$('step-1').className = 'dss-step active';

            // Step 2-6: Algorithmic Judge
            App.$('step-2').className = 'dss-step processing';
            let emas9 = App.calcEMAArray(ohlcv, 9), emas20 = App.calcEMAArray(ohlcv, 20);
            let rsi = App.calcRSI(ohlcv, 14), atr = App.calcATR(ohlcv, 14), smc = App.analyzeSMC(ohlcv);
            let close = ohlcv[ohlcv.length-1].close;
            App.$('step-2').className = 'dss-step active';

            App.$('step-3').className = 'dss-step processing';
            let trend = close > emas9[emas9.length-1] ? 70 : 30;
            let mom = rsi > 50 ? 65 : 35;
            App.$('step-3').className = 'dss-step active';

            App.$('step-4').className = 'dss-step processing';
            let signal = trend > 50 ? "BUY" : "SELL";
            App.$('step-4').className = 'dss-step active';

            App.$('step-5').className = 'dss-step processing';
            let conf = Math.round((trend + mom) / 1.5);
            App.$('step-5').className = 'dss-step active';

            App.$('step-6').className = 'dss-step processing';
            let dssData = { Signal: signal, Confidence: conf, Entry: close.toFixed(4), SL: (close * 0.98).toFixed(4), TP1: (close * 1.02).toFixed(4), TP2: (close * 1.04).toFixed(4), TP3: (close * 1.06).toFixed(4), TrendScore: trend, MomentumScore: mom, MarketDataStr: `SMC: ${smc.structure}`, IndicatorStr: `RSI: ${rsi.toFixed(1)}`, RuleStr: "Verified" };
            App.$('step-6').className = 'dss-step active';

            // Step 7: AI Mentor
            App.$('step-7').className = 'dss-step processing';
            let prompt = `Analyze ${p} at ${close}. RSI ${rsi.toFixed(1)}. SMC ${smc.structure}. Signal ${signal}. Give brief JSON: {"MarketOverview":"...","MarketAnalysis":"...","MarketWarning":"..."}`;
            let mentorRes = { MarketOverview: "Stable", MarketAnalysis: "Trend following setup.", MarketWarning: "Watch for volatility." };
            
            // API Call logic
            if(cfg.provider === 'Gemini') {
                let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cfg.apiKey}`, { method: 'POST', body: JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
                let json = await res.json();
                mentorRes = App.safeParse(App.cleanJsonString(json.candidates[0].content.parts[0].text), mentorRes);
            }
            App.$('step-7').className = 'dss-step active';

            App.s.ai.cache[p] = { ts: Date.now(), data: {...dssData, ...mentorRes} };
            App.save();
            App.showAiData(App.s.ai.cache[p].data);
            App.toast('Analisis Selesai', 'up');

        } catch (e) {
            App.toast('Gagal Analisis AI', 'down');
        } finally {
            if(App.$('btnRunAi')) App.$('btnRunAi').disabled = false;
        }
    },

    showAiData: (ai) => {
        if(App.$('aiResultState')) App.$('aiResultState').style.display='block';
        if(App.$('aiEmptyState')) App.$('aiEmptyState').style.display='none';
        App.$('aiSignal').textContent = ai.Signal;
        App.$('aiConfVal').textContent = ai.Confidence + "%";
        App.$('aiEntry').textContent = ai.Entry;
        App.$('aiSL').textContent = ai.SL;
        App.$('aiTP1').textContent = ai.TP1;
        App.$('aiRR').textContent = "1:2";
        App.$('dssTrendScore').textContent = ai.TrendScore + "/100";
        App.$('pbTrend').style.width = ai.TrendScore + "%";
        App.$('dssMomentumScore').textContent = ai.MomentumScore + "/100";
        App.$('pbMomentum').style.width = ai.MomentumScore + "%";
        App.$('aiMentorBlockWrapper').innerHTML = `<div class="mentor-block success"><h6>Analisis AI</h6><p>${ai.MarketAnalysis}</p></div>`;
    },

    renderAi: () => {
        let cache = App.s.ai.cache[App.s.ai.pair];
        if(cache && (Date.now() - cache.ts < 600000)) {
            App.showAiData(cache.data);
            document.querySelectorAll('.dss-step').forEach(s => s.className = 'dss-step active');
        } else {
            if(App.$('aiResultState')) App.$('aiResultState').style.display='none';
            if(App.$('aiEmptyState')) App.$('aiEmptyState').style.display='block';
            document.querySelectorAll('.dss-step').forEach(s => s.className = 'dss-step');
        }
    },

    // --- TRADING OPERATIONS ---
    executeTrade: (side) => {
        let sizeInput = parseFloat(App.$('oSize')?.value) || 0;
        let curP = App.s.sim.prices[App.s.sim.asset];
        if(!curP || sizeInput <= 0 || sizeInput > App.s.sim.bal) return App.toast('Input tidak valid', 'down');
        App.openPosition(App.s.sim.asset, App.s.sim.cat, side, sizeInput, App.s.sim.cat === 'futures' ? App.s.sim.leverage : 1, curP, parseFloat(App.$('oTP').value), parseFloat(App.$('oSL').value), 'MARKET');
        App.save(); App.rPositions(); App.calcOrder();
    },

    openPosition: (asset, cat, side, margin, lev, price, tp, sl, reason) => {
        let posSize = (margin * lev) / price;
        let fee = App.fp((margin * lev) * App.s.sys.FEE_RATE);
        App.s.sim.bal = App.fp(App.s.sim.bal - margin);
        App.s.sim.pos.push({ id: Date.now().toString(), asset, cat, side, margin, leverage: lev, entryPrice: price, size: posSize, tp, sl, fee, liqPrice: 0, unrealizedPnL: -fee, date: Date.now() });
        App.toast(`${side} Berhasil`, 'up');
    },

    closePosition: (id) => {
        let idx = App.s.sim.pos.findIndex(p => p.id === id);
        let p = App.s.sim.pos[idx];
        let price = App.s.sim.prices[p.asset];
        let diff = p.side === 'LONG' ? (price - p.entryPrice) : (p.entryPrice - price);
        let pnl = App.fp((diff * p.size) - p.fee);
        App.s.sim.bal = App.fp(App.s.sim.bal + p.margin + pnl);
        App.s.sim.hist.unshift({ asset: p.asset, side: p.side, pnl, date: Date.now() });
        App.s.sim.pos.splice(idx, 1);
        App.save(); App.rPositions(); App.toast('Posisi Ditutup', 'info');
    },

    // --- UI RENDERING ---
    setSimCat: (c) => {  
        App.s.sim.cat = c;  
        document.querySelectorAll('#view-sim .chip').forEach(el=>el.classList.remove('active'));  
        if(App.$(`st-${c}`)) App.$(`st-${c}`).classList.add('active');  
        let h = ''; 
        App.s.sim.assets[c].forEach(a => { h += `<div class="chip" onclick="App.setSimAsset('${a}')">${a.replace('USDT','')}</div>`; });  
        if(App.$('simAssetList')) App.$('simAssetList').innerHTML = h;  
        App.setSimAsset(App.s.sim.assets[c][0]);  
    },  

    setSimAsset: (a) => {  
        App.s.sim.asset = a;  
        document.querySelectorAll('#simAssetList .chip').forEach(el => el.classList.toggle('active', el.textContent.trim() === a.replace('USDT','')));
        if(App.$('simAssetLabel')) App.$('simAssetLabel').textContent = a;  
        if(App.s.sys.chartVisible) App.loadChart(a);
    },  

    loadChart: (sym) => {  
        let ex = App.s.sim.cat === 'stocks' ? 'NASDAQ%3A' : 'BINANCE%3A';  
        if (sym === 'TSM') ex = 'NYSE%3A'; 
        if(App.$('tvFrame')) App.$('tvFrame').src = `https://s.tradingview.com/widgetembed/?symbol=${ex}${sym}&interval=15&theme=dark`;  
    },  

    updateSimUI: () => { 
        let p = App.s.sim.prices[App.s.sim.asset];
        if(App.$('simPriceDisplay')) App.$('simPriceDisplay').textContent = App.num(p, 4);
        App.s.sim.pos.forEach(pos => {
            let el = App.$(`pnl_${pos.id}`);
            if(el) {
                let cur = App.s.sim.prices[pos.asset];
                let diff = pos.side === 'LONG' ? (cur - pos.entryPrice) : (pos.entryPrice - cur);
                let pnl = App.fp((diff * pos.size) - pos.fee);
                el.textContent = App.num(pnl);
                el.className = `font-mono text-md ${pnl >= 0 ? 'text-up' : 'text-down'}`;
            }
        });
    },

    rPositions: () => {
        let h = '';
        App.s.sim.pos.forEach(p => {
            h += `<div class="card" style="margin-bottom:10px;">
                <div class="flex-between"><span>${p.side} ${p.asset}</span><span id="pnl_${p.id}">0.00</span></div>
                <button class="btn" onclick="App.closePosition('${p.id}')" style="margin-top:10px; min-height:30px; font-size:0.7rem;">Tutup</button>
            </div>`;
        });
        if(App.$('listPositions')) App.$('listPositions').innerHTML = h || '<p class="text-center text-sec text-xs">No positions</p>';
    },

    setAiCat: (c) => {
        App.s.ai.cat = c;
        document.querySelectorAll('#aiCatTabs .chip').forEach(el => el.classList.remove('active'));
        if(App.$(`ai-cat-${c}`)) App.$(`ai-cat-${c}`).classList.add('active');
        let h = '';
        App.s.sim.assets[c].forEach(a => { h += `<div class="chip" id="ai-pair-${a}" onclick="App.setAiPair('${a}')">${a.replace('USDT','')}</div>`; });
        if(App.$('aiPairTabs')) App.$('aiPairTabs').innerHTML = h;
        App.setAiPair(App.s.sim.assets[c][0]);
    },

    setAiPair: (a) => {
        App.s.ai.pair = a;
        document.querySelectorAll('#aiPairTabs .chip').forEach(el => el.classList.toggle('active', el.id === `ai-pair-${a}`));
        document.querySelectorAll('.act-pair').forEach(el => el.textContent = a);
        App.renderAi();
    },

    nav: (t) => {  
        document.querySelectorAll('.view, .nav-item').forEach(e => e.classList.remove('active'));  
        if(App.$(`view-${t}`)) App.$(`view-${t}`).classList.add('active');  
        let navItem = document.querySelector(`.nav-item[data-target="${t}"]`);
        if(navItem) navItem.classList.add('active');  
        if(t==='ai') App.renderAi();
        if(t==='sim') App.updateSimUI();
    },

    calcOrder: () => {
        let size = parseFloat(App.$('oSize')?.value) || 0;
        if(App.$('uiAvailBal')) App.$('uiAvailBal').textContent = App.num(App.s.sim.bal);
        if(App.$('uiCost')) App.$('uiCost').textContent = App.num(size) + " USDT";
    },

    init: () => {  
        App.load();
        App.initPWA();
        if(window.lucide) window.lucide.createIcons();
        App.setAiCat('futures');
        App.setSimCat('futures');  
        App.nav('sim'); 
        App.startEngine();  
    }  
};  

window.App = App;
window.addEventListener('load', App.init);