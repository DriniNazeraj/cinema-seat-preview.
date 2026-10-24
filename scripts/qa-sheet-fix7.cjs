const {chromium}=require('/workspace/qa/node_modules/playwright-core');const B='http://localhost:4175';const O='/workspace/cinema/final/qa-fix9/';
const L=(...a)=>console.log(...a);
async function seatsUrl(pg){await pg.goto(B+'/movie/starlight-run',{waitUntil:'networkidle'});await pg.locator('button:has-text(":"):not([disabled])').first().click();await pg.waitForURL(/seats/);return pg.url().split('?')[0]+'?'+new URL(pg.url()).searchParams.toString()+'&party=1';}
const st=pg=>pg.evaluate(()=>({curt:document.querySelector('[data-curtains]')?.dataset.curtains||'none',canvas:!!document.querySelector('canvas'),sheet:!!document.querySelector('[role=dialog]'),peek:!![...document.querySelectorAll('button')].find(b=>/^Change seats/.test(b.getAttribute("aria-label")||"")),view:document.querySelector('[data-view]')?.innerText||null,busy:document.querySelector('[aria-busy]')?.getAttribute('aria-busy'),status:document.querySelector('p[role=status]')?.innerText,active:document.activeElement?.getAttribute('aria-label')||document.activeElement?.innerText?.slice(0,30),ov:document.documentElement.scrollWidth>innerWidth,marks:performance.getEntriesByType('mark').filter(m=>m.name.startsWith('lumen')).map(m=>m.name+':'+Math.round(m.startTime))}));
(async()=>{const br=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
for(const vp of [{n:'m390',w:390,h:844,m:true},{n:'d1440',w:1440,h:900}]){
 for(const mode of ['3d','nofps','fpsslow','simple','reduced']){
 const ctx=await br.newContext({viewport:{width:vp.w,height:vp.h},isMobile:!!vp.m,hasTouch:!!vp.m,deviceScaleFactor:vp.m?3:1,reducedMotion:mode=='reduced'?'reduce':'no-preference'});
 const pg=await ctx.newPage();const errs=[],bad=[];const T=vp.n+'/'+mode;
 pg.on('console',m=>m.type()=='error'&&errs.push(m.text().slice(0,160)));pg.on('pageerror',e=>errs.push('PE '+e.message.slice(0,160)));pg.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url())});
 try{
  const base=await seatsUrl(pg);const fl={['3d']:'&3d=1',nofps:'&nofps=1',fpsslow:'&fps=slow',simple:'&simple=1',reduced:'&3d=1'}[mode];
  await pg.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('lumen.simple')});
  await pg.goto(base+fl,{waitUntil:'domcontentloaded'});
  await pg.waitForTimeout(300);L(T,'t300',JSON.stringify(await st(pg)));
  await pg.waitForTimeout(6000);let s=await st(pg);L(T,'t6s',JSON.stringify(s));
  await pg.screenshot({path:O+T.replace('/','-')+'-open.png'});
  if(mode=='fpsslow'){await pg.waitForTimeout(4000);const toast=await pg.locator('text=Running slow').count();L(T,'toast',toast);
   if(toast){await pg.screenshot({path:O+T.replace('/','-')+'-toast.png'});await pg.locator('button:has-text("Switch")').click();await pg.waitForTimeout(800);L(T,'after switch',JSON.stringify(await st(pg)),await pg.evaluate(()=>localStorage.getItem('lumen.simple')));
    await pg.reload();await pg.waitForTimeout(3000);L(T,'reload after switch',JSON.stringify(await st(pg)));}
  }
  // sheet close methods
  if(s.sheet){await pg.keyboard.press('Escape');await pg.waitForTimeout(400);L(T,'esc',JSON.stringify(await st(pg)));
   await pg.locator('button[aria-label^="Change seats"]').click();await pg.waitForTimeout(400);L(T,'change seats reopen',(await st(pg)).sheet);
   await pg.locator('button[aria-label="Collapse seat picker"]').click();await pg.waitForTimeout(400);L(T,'x close',!(await st(pg)).sheet);
   await pg.locator('button[aria-label^="Selected:"]').click();await pg.waitForTimeout(400);L(T,'bar tap reopen',(await st(pg)).sheet);}
  const free=pg.locator('[role=dialog] [data-seatgrid] button:not([aria-disabled])');if(vp.m){await pg.locator('button[aria-label="Zoom in on seats"]').click();await pg.waitForTimeout(300);} /* fix7: phone fit-mode taps zoom; zoom first */
  await free.nth(40).click();await pg.waitForTimeout(2500);s=await st(pg);L(T,'after pick',JSON.stringify({sheet:s.sheet,peek:s.peek,view:s.view,active:s.active}));
  await pg.screenshot({path:O+T.replace('/','-')+'-picked.png'});
  if(!s.sheet){await pg.locator('button[aria-label^="Change seats"]').click();await pg.waitForTimeout(400);}
  await free.nth(41).click();await pg.waitForTimeout(1500);if(!(await st(pg)).sheet){await pg.locator('button[aria-label^="Change seats"]').click();await pg.waitForTimeout(400);}
  await free.nth(41).click();await pg.waitForTimeout(1500);L(T,'unpick 2nd view',(await st(pg)).view);
  await pg.locator('button:has-text("Continue"):visible').first().click();await pg.waitForTimeout(1500);L(T,'continue ->',pg.url());
  for(const [n,v] of [['name','Test QA'],['email','qa@example.com'],['phone','+355 600 000 000']]){const i=pg.locator(`input[name=${n}]`);if(await i.count())await i.fill(v)}
  await pg.locator('button[type=submit]').click();await pg.waitForTimeout(3000);L(T,'confirmed',pg.url(),(await pg.locator('h1').first().innerText().catch(()=>'')).slice(0,60));
 }catch(e){L(T,'FAIL',e.message.split('\n')[0].slice(0,250));await pg.screenshot({path:O+T.replace('/','-')+'-fail.png'})}
 L(T,'errs',JSON.stringify([...new Set(errs)]),'bad',JSON.stringify([...new Set(bad)]));await ctx.close()}}
await br.close()})();
