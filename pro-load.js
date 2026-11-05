// The official build's Pro modules are not in this repository: they live in a private checkout at pro/ beside these files, and the
// Mac app bundles them. This loads pro/web/pro.js (which writes the module tags, in order, before app.js) only when the host says
// Pro is there: the Mac app injects __ASSETBOARD_NATIVE__.pro at document start; a browser with a pro/ checkout adds ?pro to the
// address. Without either, nothing is requested and the board runs the free features (pro-slots.js leaves every slot empty).
const proPresent=typeof window!=='undefined'&&(!!window.__ASSETBOARD_NATIVE__?.pro||new URLSearchParams(location.search).has('pro'));
if(proPresent)document.write('<script src="pro/web/pro.js"><\/script>');
