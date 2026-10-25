const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../home-app/app.js'),'utf8');
// Run the production renderer with a small DOM fixture. The native dashboard's
// recommendation callbacks survive replacement and remove every .netflix node.
const renderer=source.slice(source.indexOf('    function renderApps() {'),source.indexOf('    function refreshDevices('));
assert.ok(renderer.length>0);
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.className='';this.parentNode=null;this._text='';}
 set textContent(value){this._text=value;this.children.forEach(c=>c.parentNode=null);this.children=[];}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key] || null;}
 appendChild(node){this.children.push(node);node.parentNode=this;return node;}
 removeChild(node){this.children.splice(this.children.indexOf(node),1);node.parentNode=null;}
}
const row=new Element('div'),count=new Element('span'),stockArea=new Element('div');
const catalog=[
 {id:'youtube',name:'YouTube',style:'youtube',symbol:'Y'},
 {id:'netflix',name:'Netflix',style:'netflix',symbol:'N'},
 {id:'OpenInternet',name:'Internet browser',style:'OpenInternet',symbol:'O'}
];
const favourites=['youtube','netflix','OpenInternet'],launched=[];
const context={catalog,favourites,
 document:{getElementById:id=>id==='apps'?row:count,createElement:tag=>new Element(tag)},
 getApp:id=>catalog.find(a=>a.id===id),
 button:(text,callback)=>{const b=new Element('button');b.textContent=text;b.click=callback;return b;},
 attempt:fn=>fn(),HomeTV:{app:id=>launched.push(id)},customize(){}
};
vm.createContext(context);vm.runInContext(renderer+'\nrenderApps();',context);
const appIds=()=>row.children.map(n=>n.getAttribute('data-app')).filter(Boolean);
assert.deepEqual(appIds(),favourites);
const selected=row.children.find(n=>n.getAttribute('data-app')==='netflix');
// This is the selection condition used by Add apps; it remained true in the bug.
assert.ok(favourites.includes('netflix'));
function nativeRecommendationCleanup(){
 for(const parent of [row,stockArea]) {
  for(const node of parent.children.slice()) {
   if(node.className.split(/\s+/).includes('netflix'))parent.removeChild(node);
  }
 }
}
const recommendation=new Element('div');recommendation.className='netflix';stockArea.appendChild(recommendation);
nativeRecommendationCleanup();
assert.equal(stockArea.children.length,0,'The stock recommendation cleanup still works');
assert.deepEqual(appIds(),favourites,'Stock cleanup must not delete an added Netflix tile');
assert.equal(row.children.find(n=>n.getAttribute('data-app')==='netflix'),selected,'The tile survives without redraw or focus replacement');
selected.click();assert.deepEqual(launched,['netflix'],'Styling must not change the native launch ID');
vm.runInContext('renderApps();',context);nativeRecommendationCleanup();
assert.deepEqual(appIds(),favourites,'The class isolation also survives a favourites redraw');
console.log('Passed: native Netflix recommendation cleanup preserves favourites, tile identity and app launch.');
