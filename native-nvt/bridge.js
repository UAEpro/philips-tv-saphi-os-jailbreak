/* Bridge for the TPN226E native Home runtime, using its own Home page methods. */
var HomeTV=(function(){
 var tv=parent.RzeroNativeHome;
 if(!tv)throw Error('Native Philips Home bridge unavailable');
 return {live:true,session:false,installedApps:function(){return tv.apps();},refreshApps:function(cb){tv.refresh().then(function(){cb(tv.apps())},function(){cb(null)});},
 connectedInputs:function(){return [];},inputs:function(){return tv.inputs();},app:function(id){return tv.launch(id);},settings:function(){tv.settings();},source:function(id){tv.source(id);},back:function(){tv.dismiss();},systemKey:function(){}};
}());
