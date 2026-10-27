async(page)=>{
 // Themes (task 08): presets spread over cool, warm and neutral, vivid and quiet; every palette meets WCAG AA in light and dark
 // for any input; an accent near the status hues is muted; the choice is a per-viewer preference (never board data), kept across
 // reloads; cancel restores; a custom colour or pasted JSON theme works, and invalid ones are refused or ignored without harm.
 // Polls from the test side: the page's CSP forbids the eval that page.waitForFunction relies on.
 const until=async(page,fn,arg,{timeout=10000}={})=>{const end=Date.now()+timeout;for(;;){const value=await page.evaluate(fn,arg);if(value)return value;if(Date.now()>end)throw new Error('Timed out waiting for '+String(fn).slice(0,80));await new Promise(r=>setTimeout(r,40));}};
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const context=await page.context().browser().newContext();
 try{
  const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:4317/');await until(p,()=>typeof themeDialog==='function'&&!!document.querySelector('#theme'));
  const result=await p.evaluate(()=>{
   let minimum=Infinity;
   const inputs=[...themePresets.map(t=>t[0]),'system','#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ffcc00','#ff9500',{accent:'#ffffff',accentDark:'#000000',tint:1},{accent:'#123456',tint:0}];
   for(const scheme of ['light','dark'])for(const input of inputs){
    const palette=themePalette(input==='system'?themeFor({id:'system'}):input,scheme);
    for(const role of ['canvas','category','card','ink','muted','primary'])if(!palette[role].every(v=>Number.isInteger(v)&&v>=0&&v<=255))throw Error('Out of gamut: '+JSON.stringify(input));
    // Surfaces are opaque; the accent is a button fill (white text in light, the canvas in dark) and accent text on every surface.
    const onPrimary=scheme==='dark'?palette.canvas:[255,255,255],surfaces=[palette.canvas,palette.category,palette.card];
    const score=Math.min(...surfaces.flatMap(s=>[themeContrast(palette.muted,s),themeContrast(palette.ink,s)]),themeContrast(onPrimary,palette.primary),themeContrast(palette.primary,palette.card),
     ...(scheme==='light'?surfaces.map(s=>themeContrast(palette.primary,s)):[]));
    if(score<4.5)throw Error(`Insufficient contrast: ${JSON.stringify(input)} ${scheme} ${score.toFixed(2)}`);minimum=Math.min(minimum,score);
    if(scheme==='dark'&&palette.card[0]>90)throw Error('Dark surfaces are not dark: '+JSON.stringify(input));
    // Status colours stay recognisable: a vivid accent keeps clear of their hues, an accent near them is muted.
    const o=themeOklch(palette.primary);
    if(o.c>STATUS_MUTED_CHROMA+.01&&STATUS_HUES.some(h=>hueGap(h,o.h)<STATUS_GAP))throw Error(`Accent too close to a status colour: ${JSON.stringify(input)} ${scheme}`);
   }
   // The presets span the wheel and the range from vivid to quiet.
   const looks=themePresets.map(([id])=>themeOklch(themePalette(id,'light').primary));
   const warm=looks.filter(o=>o.c>.06&&(o.h<120||o.h>330)).length,cool=looks.filter(o=>o.c>.06&&o.h>=150&&o.h<=300).length,neutral=looks.filter(o=>o.c<.05).length;
   const vivid=looks.filter(o=>o.c>=.12).length,quiet=looks.filter(o=>o.c<.11).length;
   if(themePresets.length<8||warm<2||cool<2||neutral<2||vivid<3||quiet<3)throw Error('Not enough range: '+JSON.stringify({warm,cool,neutral,vivid,quiet}));
   if(themePalette('invalid').seed!==themePresets[0][2]||themePalette({accent:'red'}).seed!==themePresets[0][2])throw Error('Invalid theme fallback');
   return minimum;
  });
  // Custom themes: refusals with a reason, nothing half-kept.
  const refusals=await p.evaluate(()=>['{','[]','{"accent":"#12345"}','{"accent":"#123456","colour":"#fff"}','{"accent":"#123456","tint":2}','{"accent":"#123456","accentDark":"blue"}','{"accent":"#123456","name":""}',' '.repeat(2001)].map(t=>checkTheme(t)));
  check(refusals.every(r=>!r.ok&&r.error),'Bad custom themes are refused: '+JSON.stringify(refusals));
  check(await p.evaluate(()=>{const r=checkTheme('{"name":"夜航","accent":"#0A6FE8","accentDark":"#5ea4ff","tint":0.3}');return r.ok&&r.theme.accent==='#0a6fe8'&&r.theme.tint===.3;}),'A good custom theme is read');

  const primary=()=>p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tone-primary').trim());
  const start=await primary();
  // Preview and cancel.
  await p.locator('#theme').click();
  check(await p.locator('.theme-swatch').count()===await p.evaluate(()=>themePresets.length+1),'Every preset and 跟随系统 is offered');
  await p.locator('[data-theme-id="plum"]').click();
  check(await primary()!==start,'A swatch previews at once');
  await p.locator('#close-modal').click();
  await until(p,start=>getComputedStyle(document.documentElement).getPropertyValue('--tone-primary').trim()===start,start);
  // Choose and keep: in this browser's storage, not in the board.
  await p.locator('#theme').click();await p.locator('[data-theme-id="indigo"]').click();await p.locator('#save-theme').click();
  const indigo=await primary();
  await p.reload();await until(p,()=>typeof themeDialog==='function');
  check(await primary()===indigo,'The chosen theme survives a reload');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem(THEME_KEY)).id==='indigo'&&state.theme===undefined),'Kept as a preference, not in the board');
  // A pasted JSON theme: refused when bad (the preview stays), applied and kept when good.
  await p.locator('#theme').click();await p.locator('.theme-json summary').click();
  await p.locator('#theme-json').fill('{"accent":"#ff0","oops":1}');await p.locator('#theme-json-apply').click();
  check(await p.evaluate(()=>document.querySelector('#theme-json-status').classList.contains('bad'))&&await primary()===indigo,'A bad JSON theme is refused and changes nothing');
  await p.locator('#theme-json').fill('{"name":"苔原","accent":"#2f8f4e","tint":0.8}');await p.locator('#theme-json-apply').click();
  const custom=await primary();check(custom!==indigo,'A good JSON theme previews');
  await p.locator('#save-theme').click();await p.reload();await until(p,()=>typeof themeDialog==='function');
  check(await primary()===custom&&await p.evaluate(()=>JSON.parse(localStorage.getItem(THEME_KEY)).custom.name==='苔原'),'The custom theme is kept');
  // A broken stored preference is ignored: the default theme, and the page still works.
  await p.evaluate(()=>localStorage.setItem(THEME_KEY,'{"id":"custom","custom":{"accent":"javascript:alert(1)"}}'));await p.reload();await until(p,()=>typeof themeDialog==='function');
  const fallback=await p.evaluate(()=>{const d=themePalette(themePresets[0][0],currentScheme()).primary.join(',');return getComputedStyle(document.documentElement).getPropertyValue('--tone-primary').trim()===d&&themePref===null;});
  check(fallback,'A broken stored theme falls back to the default');
  // 跟随系统 follows the accent the app passes in (here a green), and its changes.
  await p.evaluate(()=>{writeThemePref({id:'system'});window.assetboardSystemAccent('#28cd41');});
  const green=await p.evaluate(()=>themeOklch(getComputedStyle(document.documentElement).getPropertyValue('--tone-primary').split(',').map(Number)));
  check(green.h>120&&green.h<160,'跟随系统 takes the system accent: '+JSON.stringify(green));
  // The legacy colour kept in the board by an earlier version still counts until a theme is chosen.
  await p.evaluate(()=>{localStorage.removeItem(THEME_KEY);themePref=null;state.theme='#b16c86';applyBoardTheme();});
  check(await primary()===await p.evaluate(()=>themePalette('plum',currentScheme()).primary.join(',')),'An old 玫瑰 choice maps to 梅子');
  check(!errors.length,'Page errors: '+errors.join(' | '));
  return {passed:'Contrast for presets, system and extreme inputs (light and dark), status hues, range, refusals, preview/cancel, keep, JSON theme, broken preference, system accent, legacy colour',minimum:result};
 }finally{await context.close();}
}
