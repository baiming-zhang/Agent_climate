const $=id=>document.getElementById(id);
function panel(open){$('settingsPanel').hidden=!open;$('settings').setAttribute('aria-expanded',String(open));}
$('settings').onclick=()=>panel($('settingsPanel').hidden);
$('closeSettings').onclick=()=>panel(false);
$('aboutOpen').onclick=()=>{$('about').showModal();panel(false);};
$('aboutClose').onclick=()=>$('about').close();
$('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{for(const x of document.querySelectorAll('[data-view]'))x.classList.toggle('active',x===b);if(innerWidth<700)panel(false);});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON'].includes(document.activeElement.tagName)&&!$('about').open){e.preventDefault();$('play').click();}if(e.code==='Escape')panel(false);});
if(!window.WebGL2RenderingContext){$('loading').style.display='none';$('error').hidden=false;$('error').textContent='WebGL2 is required. Use a recent Chrome, Edge or Safari browser.';}
