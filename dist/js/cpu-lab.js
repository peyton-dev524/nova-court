import { createAIDirector, AI_TRACE_LIMIT, DIFFICULTY_PRESETS } from "./ai.js?v=5.0";
import { NovaCourtEngine } from "./engine.js?v=6.1";

const T = globalThis.THREE;
const $ = (selector) => document.querySelector(selector);
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const query = new URLSearchParams(location.search);

export const CPU_LAB_SCENARIOS = Object.freeze({
  "open-jumper": { label: "Open jumper", clock: 14, holder: [0, .2], defender: [3.5, 1.2], mate: [4.1, .2], help: [4.15, -.1] },
  "light-contest": { label: "Lightly contested", clock: 11, holder: [0, .3], defender: [1.85, .2], mate: [-4.3, .2], help: [4.5, -.5] },
  "hard-contest-pass": { label: "Hard contest + open teammate", clock: 10, holder: [1.2, 1.1], defender: [1.35, .78], mate: [-2.45, -3.7], help: [3.8, -.2] },
  "late-clock": { label: "Late clock", clock: 1.7, holder: [0, 1.2], defender: [.8, .5], mate: [-4.1, 1.2], help: [3.2, .4] },
  "corner-trap": { label: "Corner trap", clock: 9, holder: [6.75, 6.1], defender: [6.15, 5.45], mate: [1.1, 2.3], help: [5.35, 4.8] },
  transition: { label: "Transition lane", clock: 18, holder: [0, 6.2], defender: [3.2, 1.4], mate: [-3.8, 2], help: [5, -1.2] },
  "help-defense": { label: "Help defense", clock: 8, holder: [1.3, 3.2], defender: [1.6, 1.8], mate: [-4.6, 1.5], help: [-.2, 2.4] },
  rebound: { label: "Loose ball / rebound", clock: 14, holder: null, defender: [1.8, -3.8], mate: [-2.4, -4.2], help: [3.1, -2.6], ball: [0, -5.3] },
});

const state = {
  scenario: CPU_LAB_SCENARIOS[query.get("scenario")] ? query.get("scenario") : "open-jumper",
  difficulty: DIFFICULTY_PRESETS[query.get("difficulty")] ? query.get("difficulty") : "pro",
  seed: Number(query.get("seed")) || 41,
  shotClock: 14,
  playing: false,
  overlays: { targets: true, scores: true, timeline: true },
  tracePlayer: "cpu-handler",
};
const roster = [
  { id:"cpu-handler",name:"Axiom",team:"away",isAI:true,role:"handler",shooting:.86,jerseyNumber:1,primary:0xff6438,accent:0xffca62 },
  { id:"cpu-wing",name:"Vector",team:"away",isAI:true,role:"wing",shooting:.9,jerseyNumber:7,primary:0xff6438,accent:0xffca62 },
  { id:"cpu-big",name:"Atlas",team:"away",isAI:true,role:"big",shooting:.67,jerseyNumber:33,primary:0xff6438,accent:0xffca62 },
  { id:"defender",name:"Nova",team:"home",controlled:true,isAI:false,role:"handler",jerseyNumber:4,primary:0x35d5ea,accent:0xffffff },
  { id:"help",name:"Orbit",team:"home",isAI:false,role:"wing",jerseyNumber:8,primary:0x35d5ea,accent:0xffffff },
];
const engine = new NovaCourtEngine({ container:$("#cpu-stage"),players:roster,mode:"cpu-lab",cameraMode:"broadcast",shadows:true,pixelRatio:1,visualQuality:"balanced",venue:"arena" });
engine.start();
engine.setPaused(true);
engine.camera.position.set(10.8,8.7,13.5);
engine.camera.lookAt(0,1.1,0);
engine.cameraTarget.set(0,1.1,0);
let director;
let latestIntents=[];

const overlayRoot=new T.Group();
engine.worldRoot.add(overlayRoot);
function segment(color){return new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineBasicMaterial({color,transparent:true,opacity:.9,depthTest:false}))}
const targetLines=new Map();
for(const item of engine.players){const target=segment(0xffca62),face=segment(0x63eaff);overlayRoot.add(target,face);targetLines.set(item.id,{target,face})}
function player(id){return engine.players.find((item)=>item.id===id)}
function setXZ(id,coordinates){const item=player(id);item.root.position.set(coordinates[0],0,coordinates[1]);item.velocity.set(0,0,0);item.desiredVelocity.set(0,0,0)}
function buildSnapshot(){
  const scenario=CPU_LAB_SCENARIOS[state.scenario],helpDefense=state.scenario==="help-defense";
  const holder=helpDefense?player("defender"):scenario.holder?player("cpu-handler"):null;
  return {
    players:engine.players.filter((item)=>!(helpDefense&&item.id==="cpu-big")).map((item)=>({id:item.id,teamId:item.team,position:{x:item.root.position.x,z:item.root.position.z},velocity:{x:item.velocity.x,z:item.velocity.z},hasBall:item===holder,role:item.metadata.role,shooting:item.metadata.shooting??(item.id==="cpu-wing"?.9:.75),stamina:item.stamina,isHuman:false,aiEnabled:item.team==="away",canDunk:item.metadata.role==="big"})),
    ball:{holderId:holder?.id||null,position:{x:engine.ball.position.x,z:engine.ball.position.z},velocity:{x:0,z:-.4},isLoose:!holder,airborne:state.scenario==="rebound",isShotResolved:state.scenario!=="rebound"},
    offenseTeamId:helpDefense?"home":"away",phase:"live",possessionId:1,shotClock:state.shotClock,attackBaskets:{away:{x:0,z:-5.7},home:{x:0,z:5.7}},court:{halfWidth:7.5,halfLength:7,threePointRadius:6.15},
  };
}
function reset(){
  const scenario=CPU_LAB_SCENARIOS[state.scenario];state.playing=false;state.shotClock=scenario.clock;
  if(state.scenario==="help-defense"){
    setXZ("cpu-handler",scenario.defender);setXZ("cpu-wing",scenario.help);setXZ("cpu-big",[-3.2,-2.3]);setXZ("defender",scenario.holder);setXZ("help",scenario.mate);
  }else{
    setXZ("cpu-handler",scenario.holder||[-.2,-4.5]);setXZ("cpu-wing",scenario.mate);setXZ("cpu-big",[-3.2,-2.3]);setXZ("defender",scenario.defender);setXZ("help",scenario.help);
  }
  engine.ball.owner=null;for(const item of engine.players)item.hasBall=false;
  if(state.scenario==="help-defense")engine.givePossession(player("defender"),true);
  else if(scenario.holder)engine.givePossession(player("cpu-handler"),true);
  else engine.releaseBall(new T.Vector3(scenario.ball[0],.28,scenario.ball[1]),new T.Vector3(),"shot");
  director=createAIDirector({difficulty:state.difficulty,seed:state.seed,debug:true});
  const desiredAction={"open-jumper":"shoot","light-contest":"shoot","hard-contest-pass":"pass","late-clock":"shoot","corner-trap":"pass"}[state.scenario];
  for(let attempt=0;attempt<(desiredAction?10:1);attempt+=1){
    latestIntents=director.update(.1,buildSnapshot());
    if(latestIntents.find((intent)=>intent.playerId==="cpu-handler")?.action?.type===desiredAction)break;
  }
  syncUI();
}
function step(seconds=.18){
  state.shotClock=Math.max(.4,state.shotClock-seconds);const snapshot=buildSnapshot();snapshot.shotClock=state.shotClock;latestIntents=director.update(seconds,snapshot);
  for(const intent of latestIntents){const item=player(intent.playerId);if(!item)continue;const dx=intent.move.target.x-item.root.position.x,dz=intent.move.target.z-item.root.position.z,size=Math.hypot(dx,dz)||1,travel=Math.min(size,seconds*intent.move.speed*1.7);item.root.position.x+=dx/size*travel;item.root.position.z+=dz/size*travel;item.facing.set(intent.face.x-item.root.position.x,0,intent.face.z-item.root.position.z).normalize()}
  syncUI();return latestIntents;
}
function updateWorldOverlays(){
  overlayRoot.visible=state.overlays.targets;
  for(const intent of latestIntents){const item=player(intent.playerId),lines=targetLines.get(intent.playerId);if(!item||!lines)continue;lines.target.geometry.setFromPoints([item.root.position.clone().setY(.06),new T.Vector3(intent.move.target.x,.06,intent.move.target.z)]);lines.face.geometry.setFromPoints([item.root.position.clone().setY(.13),new T.Vector3(intent.face.x,.13,intent.face.z)])}
}
function selectedTrace(){const own=director.getDecisionTraces(state.tracePlayer);return own.at(-1)||director.getDecisionTraces("cpu-handler").at(-1)}
function syncUI(){
  $("#shot-clock").value=state.shotClock.toFixed(1);$("#play").textContent=state.playing?"PAUSE":"PLAY";$("#scenario-caption").textContent=`${CPU_LAB_SCENARIOS[state.scenario].label.toUpperCase()} · SEED ${state.seed} · ${state.difficulty.toUpperCase()}`;$("#capture-name").textContent=`cpu-${state.scenario}.png`;
  const traces=director.getDecisionTraces(state.tracePlayer),trace=selectedTrace();$("#trace-count").textContent=`${director.getDecisionTraces().length}/${AI_TRACE_LIMIT}`;$("#chosen").textContent=(trace?.chosenAction||"—").toUpperCase();$("#reason").textContent=trace?.reason||"Waiting for a deterministic step.";
  $("#candidate-bars").hidden=!state.overlays.scores;$("#candidate-bars").innerHTML=(trace?.candidates||[]).map((item)=>`<div class="bar" data-chosen="${item.action===trace.chosenAction}"><span>${item.action.toUpperCase()}</span><div class="bar-track"><div class="bar-fill" style="width:${clamp((item.score+.1)/1.5)*100}%"></div></div><b>${item.score.toFixed(3)}</b></div>`).join("");
  $("#timeline").hidden=!state.overlays.timeline;$("#timeline").innerHTML=traces.slice(-18).map((item)=>`<span class="tick" title="${item.sequence} ${item.chosenAction}: ${item.reason}"></span>`).join("");updateWorldOverlays();
}
function setScenario(name){if(!CPU_LAB_SCENARIOS[name])return false;state.scenario=name;state.tracePlayer=name==="help-defense"?"cpu-wing":"cpu-handler";$("#scenario").value=name;$("#trace-player").value=state.tracePlayer;reset();return true}
function saveCapture(){engine.render();engine.renderer.domElement.toBlob((blob)=>{if(!blob)return;const link=document.createElement("a");link.download=$("#capture-name").textContent;link.href=URL.createObjectURL(blob);link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1e3)},"image/png")}

for(const [id,item] of Object.entries(CPU_LAB_SCENARIOS))$("#scenario").add(new Option(item.label,id));
for(const id of Object.keys(DIFFICULTY_PRESETS))$("#difficulty").add(new Option(id.replace(/([A-Z])/g," $1").toUpperCase(),id));
for(const item of roster.filter((entry)=>entry.isAI))$("#trace-player").add(new Option(item.name,item.id));
$("#scenario").value=state.scenario;$("#difficulty").value=state.difficulty;$("#seed").value=state.seed;
$("#scenario").addEventListener("change",(event)=>setScenario(event.target.value));$("#difficulty").addEventListener("change",(event)=>{state.difficulty=event.target.value;reset()});$("#seed").addEventListener("change",(event)=>{state.seed=Number(event.target.value)||1;reset()});$("#shot-clock").addEventListener("change",(event)=>{state.shotClock=clamp(Number(event.target.value)||1,.4,24);syncUI()});$("#trace-player").addEventListener("change",(event)=>{state.tracePlayer=event.target.value;syncUI()});
$("#play").addEventListener("click",()=>{state.playing=!state.playing;syncUI()});$("#step").addEventListener("click",()=>step());$("#reset").addEventListener("click",reset);$("#capture").addEventListener("click",saveCapture);
for(const [id,key] of [["targets","targets"],["scores","scores"],["timeline-toggle","timeline"]])$("#"+id).addEventListener("change",(event)=>{state.overlays[key]=event.target.checked;syncUI()});

let last=performance.now(),metricAt=last,frames=0,accumulator=0;
function frame(now){const dt=Math.min(.05,(now-last)/1e3);last=now;if(state.playing){accumulator+=dt;if(accumulator>=.18){step(.18);accumulator=0}}engine.render();frames++;if(now-metricAt>=500){$("#fps").textContent=Math.round(frames*1e3/(now-metricAt));$("#draws").textContent=engine.renderer.info.render.calls;$("#tris").textContent=engine.renderer.info.render.triangles.toLocaleString();frames=0;metricAt=now}requestAnimationFrame(frame)}
reset();requestAnimationFrame(frame);
globalThis.__NOVA_CPU_LAB__=Object.freeze({setScenario,step,reset,setPlaying(value){state.playing=Boolean(value);syncUI();return true},getState(){return Object.freeze({scenario:state.scenario,difficulty:state.difficulty,seed:state.seed,shotClock:state.shotClock,playing:state.playing,overlays:{...state.overlays},metrics:{fps:Number($("#fps").textContent),draws:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles,textures:engine.renderer.info.memory.textures},assetLoadStatus:"production-engine-court-and-procedural-players-ready"})},getTrace(playerId=state.tracePlayer){return director.getDecisionTraces(playerId)}});
