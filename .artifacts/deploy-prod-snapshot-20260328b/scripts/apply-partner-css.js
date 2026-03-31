const fs = require('fs');
const f = 'c:/vibecity.live/src/views/PartnerDashboard.vue';

const css = `
<style scoped>
/* -- Root & Background -------------------------------------------------- */
.pd-root { position:relative; min-height:100dvh; width:100%; max-width:100vw; overflow-x:hidden; padding:16px; padding-top:80px; color:#fff; font-family:system-ui,-apple-system,sans-serif; }
@media(min-width:768px){.pd-root{padding:24px;padding-top:88px;}}
.pd-bg{position:fixed;inset:0;z-index:-1;background:#08091a;overflow:hidden;}
.pd-bg--emerald,.pd-bg--blue,.pd-bg--rose{position:absolute;border-radius:50%;filter:blur(90px);opacity:.3;will-change:transform;}
.pd-bg--emerald{width:520px;height:520px;top:-140px;right:-60px;background:radial-gradient(circle,rgba(139,92,246,.5),transparent);}
.pd-bg--blue{width:460px;height:460px;top:-100px;left:-80px;background:radial-gradient(circle,rgba(59,130,246,.45),transparent);}
.pd-bg--rose{width:600px;height:600px;bottom:-180px;left:0;background:radial-gradient(circle,rgba(99,102,241,.25),transparent);}

/* -- Container ---------------------------------------------------------- */
.pd-container{width:100%;max-width:1140px;margin:0 auto;display:flex;flex-direction:column;gap:14px;}

/* -- Hero --------------------------------------------------------------- */
.pd-hero{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px;border-radius:20px;border:1px solid rgba(139,92,246,.18);background:linear-gradient(140deg,rgba(12,10,40,.95),rgba(8,9,26,.9));backdrop-filter:blur(20px);}
.pd-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.22em;color:rgba(139,92,246,.9);font-weight:700;margin-bottom:5px;}
.pd-hero-title{font-size:clamp(1.35rem,4vw,1.9rem);font-weight:900;letter-spacing:-.025em;line-height:1.1;color:#fff;margin-bottom:4px;}
.pd-hero-sub{font-size:.82rem;color:rgba(255,255,255,.5);}
.pd-hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}

/* -- Chips -------------------------------------------------------------- */
.pd-chip{padding:10px 18px;min-height:44px;border-radius:12px;border:1px solid rgba(139,92,246,.2);background:rgba(139,92,246,.08);font-size:.8rem;font-weight:800;color:rgba(255,255,255,.75);transition:background .15s,transform .1s;touch-action:manipulation;cursor:pointer;}
.pd-chip:hover{background:rgba(139,92,246,.16);}
.pd-chip:active{transform:scale(.96);}

/* Exit button - PROMINENT */
.pd-chip--exit{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.12);color:#fca5a5;font-size:.85rem;font-weight:900;min-height:48px;padding:12px 22px;border-radius:12px;}
.pd-chip--exit:hover{background:rgba(239,68,68,.22);border-color:rgba(239,68,68,.5);}

/* -- Panel -------------------------------------------------------------- */
.pd-panel{border:1px solid rgba(139,92,246,.12);border-radius:18px;padding:18px;background:rgba(12,10,40,.6);backdrop-filter:blur(12px);}
.pd-panel--warn{border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.06);}
.pd-panel--hidden{display:none;}
@media(min-width:768px){.pd-panel--hidden{display:block!important;}}
.pd-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:14px;}

/* -- Loading ------------------------------------------------------------ */
.pd-loading{display:flex;align-items:center;gap:12px;padding:24px;}
.pd-spinner{width:22px;height:22px;border:2px solid rgba(139,92,246,.35);border-top-color:#8b5cf6;border-radius:50%;animation:pd-spin .8s linear infinite;flex-shrink:0;}
@keyframes pd-spin{to{transform:rotate(360deg);}}
.pd-loading-text{font-size:.84rem;color:rgba(255,255,255,.55);}

/* -- Section Titles ----------------------------------------------------- */
.pd-section-title{font-size:.95rem;font-weight:900;color:#fff;margin-bottom:2px;}
.pd-section-sub{font-size:.76rem;color:rgba(255,255,255,.45);}
.pd-section-badge{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;font-size:9px;font-weight:800;background:rgba(139,92,246,.18);color:#a78bfa;vertical-align:middle;}

/* -- Stat Strip --------------------------------------------------------- */
.pd-stat-strip{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:4px;}
.pd-stat-strip::-webkit-scrollbar{display:none;}
@media(min-width:1024px){.pd-stat-strip{display:grid;grid-template-columns:repeat(6,1fr);overflow:visible;}}
.pd-stat{flex:0 0 130px;min-width:130px;scroll-snap-align:start;border:1px solid rgba(139,92,246,.1);border-radius:14px;padding:14px;background:rgba(12,10,40,.5);}
@media(min-width:1024px){.pd-stat{flex:initial;min-width:0;}}
.pd-stat-label{font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:rgba(255,255,255,.45);margin-bottom:8px;font-weight:700;}
.pd-stat-value{font-size:1.5rem;font-weight:900;color:#fff;letter-spacing:-.025em;line-height:1;}
.pd-stat-value--sm{font-size:.85rem;line-height:1.4;}
.pd-stat-value--green{color:#34d399;}
.pd-stat-value--amber{color:#fbbf24;}

/* -- Subscription CTA --------------------------------------------------- */
.pd-sub-wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;}
.pd-sub-copy{flex:1 1 200px;}
.pd-sub-hint{margin-top:4px;font-size:.75rem;color:#fbbf24;}
.pd-cta{flex:1 1 100%;min-height:52px;border-radius:14px;border:none;background:linear-gradient(135deg,#8b5cf6,#6366f1,#3b82f6);color:#fff;font-size:.95rem;font-weight:900;letter-spacing:.01em;transition:filter .15s,transform .1s,box-shadow .2s;touch-action:manipulation;cursor:pointer;box-shadow:0 4px 24px rgba(139,92,246,.25);}
@media(min-width:640px){.pd-cta{flex:0 0 auto;padding:0 28px;}}
.pd-cta:hover{filter:brightness(1.1);box-shadow:0 6px 32px rgba(139,92,246,.35);}
.pd-cta:active{transform:scale(.98);}
.pd-cta:disabled{opacity:.55;box-shadow:none;}

/* -- Tab Bar ------------------------------------------------------------ */
.pd-tab-bar{display:flex;gap:8px;padding:4px;border-radius:14px;background:rgba(12,10,40,.5);border:1px solid rgba(139,92,246,.12);}
@media(min-width:768px){.pd-tab-bar{display:none;}}
.pd-tab{flex:1;padding:10px 14px;min-height:44px;border-radius:10px;font-size:.8rem;font-weight:800;color:rgba(255,255,255,.5);transition:background .15s,color .15s;touch-action:manipulation;cursor:pointer;}
.pd-tab--active{background:rgba(139,92,246,.2);color:#a78bfa;border:1px solid rgba(139,92,246,.3);}

/* -- Forms Grid --------------------------------------------------------- */
.pd-forms-grid{display:grid;gap:14px;}
@media(min-width:768px){.pd-forms-grid{grid-template-columns:1fr 1fr;}}

/* -- Badges ------------------------------------------------------------- */
.pd-badge{flex-shrink:0;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:800;border:1px solid transparent;}
.pd-badge--green{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.25);color:#86efac;}
.pd-badge--dim{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);color:rgba(255,255,255,.45);}
.pd-badge--red{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.2);color:#fca5a5;}

/* -- Form Fields -------------------------------------------------------- */
.pd-field-group{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;}
.pd-field-group--2col{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.pd-label{display:block;font-size:.78rem;color:rgba(255,255,255,.65);font-weight:600;}
.pd-label--full{grid-column:1/-1;}
.pd-input{display:block;width:100%;margin-top:5px;border:1px solid rgba(139,92,246,.18);background:rgba(12,10,40,.5);border-radius:10px;padding:11px 14px;min-height:44px;color:#fff;font-size:.84rem;outline:none;transition:border-color .15s,box-shadow .15s;-webkit-appearance:none;appearance:none;}
.pd-input:focus-visible{border-color:rgba(139,92,246,.6);box-shadow:0 0 0 2px rgba(139,92,246,.15);}
.pd-input::placeholder{color:rgba(255,255,255,.25);}
.pd-input:disabled{opacity:.4;cursor:not-allowed;}
.pd-input--sensitive{font-family:monospace;letter-spacing:.04em;}

/* -- Buttons ------------------------------------------------------------ */
.pd-action-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}
.pd-btn{padding:11px 18px;min-height:44px;border-radius:10px;font-size:.84rem;font-weight:900;transition:filter .15s,transform .1s;touch-action:manipulation;cursor:pointer;}
.pd-btn:active{transform:scale(.97);}
.pd-btn:disabled{opacity:.5;}
.pd-btn--primary{background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;border:none;box-shadow:0 2px 12px rgba(139,92,246,.2);}
.pd-btn--primary:hover{filter:brightness(1.1);}
.pd-btn--secondary{background:rgba(255,255,255,.06);border:1px solid rgba(139,92,246,.2);color:rgba(255,255,255,.8);}
.pd-btn--secondary:hover{background:rgba(139,92,246,.1);}
.pd-btn--full{width:100%;}

/* -- Referral Link ------------------------------------------------------ */
.pd-link-box{border-radius:10px;background:rgba(0,0,0,.3);border:1px solid rgba(139,92,246,.2);padding:12px 14px;}
.pd-link-label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:rgba(139,92,246,.7);font-weight:700;margin-bottom:4px;}
.pd-link-text{font-size:.8rem;color:#a78bfa;word-break:break-all;font-family:monospace;}

/* -- Orders ------------------------------------------------------------- */
.pd-order-list{display:flex;flex-direction:column;gap:8px;margin-top:12px;list-style:none;padding:0;}
.pd-order-item{border:1px solid rgba(139,92,246,.08);border-radius:12px;padding:12px 14px;background:rgba(12,10,40,.4);display:flex;flex-direction:column;gap:6px;}
.pd-order-row{display:flex;justify-content:space-between;align-items:center;}
.pd-order-sku{font-size:.85rem;font-weight:800;color:#fff;}
.pd-order-amount{font-size:.85rem;font-weight:700;color:#a78bfa;}
.pd-order-meta{display:flex;align-items:center;gap:8px;}
.pd-order-status{display:inline-block;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;background:rgba(255,255,255,.07);color:rgba(255,255,255,.5);}
.pd-order-status--paid{background:rgba(34,197,94,.15);color:#86efac;}
.pd-order-status--pending{background:rgba(245,158,11,.15);color:#fcd34d;}
.pd-order-status--fail{background:rgba(239,68,68,.12);color:#fca5a5;}
.pd-order-date{font-size:11px;color:rgba(255,255,255,.4);}
.pd-order-empty{padding:20px;text-align:center;font-size:.84rem;color:rgba(255,255,255,.38);}

/* -- Error -------------------------------------------------------------- */
.pd-error{padding:14px 16px;border-radius:12px;border:1px solid rgba(239,68,68,.28);background:rgba(239,68,68,.08);font-size:.84rem;color:#fca5a5;}

@media(prefers-reduced-motion:reduce){.pd-spinner{animation:none;}.pd-cta,.pd-btn,.pd-chip,.pd-input,.pd-tab{transition:none;}}
</style>`;

let content = fs.readFileSync(f, 'utf8');
content += '\n' + css + '\n';
fs.writeFileSync(f, content, 'utf8');
console.log('Purple/blue/navy CSS appended. Total lines:', content.split('\\n').length);
