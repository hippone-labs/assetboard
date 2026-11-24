// The edition in 设置 › 关于. The official build carries these modules and they are on for everyone, with nothing to buy, enter or
// activate. The Mac app passes nativeStore.pro at document start:
//   {on:true, kind:'official'|'developer'|'demo'}  (developer: a local build made with ASSETBOARD_PRO_DEV=1, never published)
// The page sends nothing anywhere. With ?free nothing here registers.
function proState(){return (typeof window!=='undefined'&&window.__ASSETBOARD_NATIVE__?.pro)||null;}
function proDeveloper(){return proState()?.kind==='developer';}
function proEditionText(){return demoMode?tr('演示'):proDeveloper()?tr('官方版（开发版）'):tr('官方版');}
