// Run with the browser tool's filename option. Renaming a project: double-clicking it in the sidebar turns its name into a field
// (the first click already opens the project, and the sidebar is drawn again in between); Enter keeps the new name on every record and
// follows the open view, ⌘Z undoes it, Esc keeps the old name, a redraw while typing keeps what was typed, a name another project has
// merges the two, a comma is refused, F2 starts it from the keyboard, and double-clicking the project view's title asks in a dialog.
async (page) => {
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const until=async(p,fn,arg)=>{for(let i=0;i<150;i++){if(await p.evaluate(fn,arg))return;await new Promise(r=>setTimeout(r,40));}throw new Error('Timed out: '+String(fn).slice(0,90));};
 const context=await page.context().browser().newContext({viewport:{width:1400,height:900},locale:'zh-CN'}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('http://127.0.0.1:4317/?demo');
  await until(p,()=>typeof renameProject==='function'&&!!document.querySelector('#sidebar .nav-projects'));
  const item=name=>`#sidebar .nav-projects .nav-item[data-id="project:${name}"]`;
  const projects=()=>p.evaluate(()=>projectNames(state.assets).map(x=>`${x.name}:${x.count}`).join(' '));
  const field=()=>p.evaluate(()=>{const f=document.querySelector('#project-rename');return f?{value:f.value,focused:document.activeElement===f,selected:f.selectionStart===0&&f.selectionEnd===f.value.length}:null;});
  check(await projects()==='notes-lab:5 studio:3','the demo projects changed: '+await projects());

  // Double-click: the field, focused, the name selected; Enter renames every record and the open view follows.
  await p.dblclick(item('studio'));
  let f=await field();
  check(f&&f.value==='studio'&&f.focused&&f.selected,'double-click does not open the name field: '+JSON.stringify(f));
  await p.keyboard.type('studio-web');await p.keyboard.press('Enter');
  check(await projects()==='notes-lab:5 studio-web:3','Enter does not rename: '+await projects());
  check(await p.evaluate(()=>view)==='project:studio-web','the open view does not follow the new name');
  check(await p.evaluate(()=>document.activeElement?.dataset?.id)==='project:studio-web','focus does not return to the renamed project');
  check(await p.evaluate(()=>[...document.querySelectorAll('#toast, .toast')].some(t=>t.textContent.includes('项目已改名为「studio-web」'))),'no toast for the rename');

  // ⌘Z puts the old name back on every record.
  await p.evaluate(()=>undo());
  check(await projects()==='notes-lab:5 studio:3','undo does not restore the name: '+await projects());

  // Esc keeps the old name; a redraw while typing keeps the text and the focus.
  await p.dblclick(item('studio'));
  await p.keyboard.type('abc');
  await p.evaluate(()=>render());
  f=await field();
  check(f&&f.value==='abc'&&f.focused,'a redraw loses the name being typed: '+JSON.stringify(f));
  await p.keyboard.press('Escape');
  check(!await field()&&await projects()==='notes-lab:5 studio:3','Esc does not keep the old name: '+await projects());

  // A comma is refused; the old name stays.
  await p.dblclick(item('studio'));
  await p.keyboard.type('a, b');await p.keyboard.press('Enter');
  check(await projects()==='notes-lab:5 studio:3','a name with a comma was taken: '+await projects());

  // A name another project has merges the two (each record keeps one entry); F2 starts it from the keyboard.
  await p.focus(item('studio'));await p.keyboard.press('F2');
  check((await field())?.focused,'F2 does not open the name field');
  await p.keyboard.type('notes-lab');await p.keyboard.press('Enter');
  check(await projects()==='notes-lab:8','renaming onto another project does not merge: '+await projects());
  check(await p.evaluate(()=>state.assets.every(a=>projectsOf(a).length<=1)),'a merged record lists the project twice');
  await p.evaluate(()=>undo());

  // The project view's title: double-click asks in a dialog.
  await p.evaluate(()=>setView('project:studio'));
  await p.dblclick('#view-title');
  check(await p.evaluate(()=>$('#modal').open&&!!$('#project-rename-form')),'double-clicking the title does not open the dialog');
  await p.fill('#project-rename-form [name="name"]','studio-2');
  await p.click('#project-rename-form button[type="submit"]');
  check(await projects()==='notes-lab:5 studio-2:3'&&await p.evaluate(()=>view)==='project:studio-2','the dialog does not rename: '+await projects());
  check(!errors.length,'page errors: '+errors.join(' | '));
 }finally{await context.close();}
}
