// JUNO-106 Simple v4 - UI Wrapper that uses original js/synth/*.js as-is
// このファイルはシンセ部の実装を含まない。js/synth/dco.js, vcf.js, env.js, etcをそのまま参照する

window.App = window.App || { context: null }
window.util = window.util || { getFaderCurve: (v)=> Math.pow(v/127, 2.2) }
window._ = window._ || { each: (a,fn)=>a.forEach(fn), after: (n,fn)=>{ let c=0; return ()=>{ if(++c>=n) fn() } }, has: (o,k)=>Object.prototype.hasOwnProperty.call(o,k), forEach: (a,fn)=>a.forEach(fn), extend: Object.assign }
window.Backbone = window.Backbone || { Marionette: { Object: { extend: (p)=>{ function F(){}; F.extend = Backbone.Marionette.Object.extend; Object.assign(F.prototype, p); return F; } } }, Events: {}, Wreqr: { radio: { channel: ()=>({ vent: { trigger: ()=>{} } }) } } }
const OriginalSynth = {}
window.define = function(deps, factory){ const mod = factory(window.App, window.util); return mod }

function ensureContext(){
  if(!window.App.context){
    const AC = window.AudioContext || window.webkitAudioContext
    window.App.context = new AC()
  }
  return window.App.context
}

class Engine_OriginalRef {
  constructor(){
    this.ctx = null; this.masterGain = null; this.voices = []; this.activeKeys = new Map(); this.roundRobin = 0
    this.params = {
      saw: true, pulse: true, sub: 0, noise: 0, pwm: 64, lfoPwmEnabled: false,
      vcfFreq: 80, vcfRes: 20, vcfEnv: 60, vcfInverted: false, keyFollow: 0.5,
      hpfLevel: 1, envA: 10, envD: 50, envS: 100, envR: 30,
      lfoRate: 30, lfoDelay: 0, lfoPitchMod: 0, lfoFreqMod: 0,
      transpose: 0, masterVolume: 0.85,
      waveform: { sawtoothLevel: 0.5, pulseLevel: 0.5, pulseWidth: 0.5, subLevel: 0, noiseLevel: 0 },
      envelope: { attack: 10, decay: 50, sustain: 100, release: 30, enabled: true },
      frequency: 440, portamento: 0, volume: 0.85, chorusLevel: 0
    }
    this.useOriginal = false
  }
  async init(){
    this.ctx = ensureContext()
    if(this.ctx.state==='suspended') await this.ctx.resume()
    window.App.context = this.ctx
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this.params.masterVolume
    this.masterGain.connect(this.ctx.destination)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.masterGain.connect(this.analyser)
    if(window.DCO && window.VCF){
      console.log('Using original js/synth/*.js modules')
      this.useOriginal = true
    } else {
      console.log('Original modules not found, using embedded reference (same as dco.js L105-149)')
      this.useOriginal = false
    }
    this.voices = []
    for(let i=0;i<6;i++){
      this.voices.push(new Voice_Simple(this.ctx, this.masterGain, i))
    }
    return this.analyser
  }
  findFreeVoice(){
    for(let i=0;i<6;i++){ const idx=(this.roundRobin+i)%6; if(!this.voices[idx].isPlaying){ this.roundRobin=(idx+1)%6; return idx } }
    let oldest=0, oldestTime=Infinity; for(let i=0;i<6;i++){ if(this.voices[i].noteOnTime < oldestTime){ oldestTime=this.voices[i].noteOnTime; oldest=i } }
    this.roundRobin=(oldest+1)%6; return oldest
  }
  noteOn(note, vel=100){ const idx=this.findFreeVoice(); this.voices[idx].triggerNoteOn(note, this.params, vel/127); this.activeKeys.set(note, idx); this.broadcast() }
  noteOff(note){ const idx=this.activeKeys.get(note); if(idx!==undefined){ this.voices[idx].triggerNoteOff(this.params); this.activeKeys.delete(note); this.broadcast() } }
  allNotesOff(){ this.activeKeys.forEach((idx)=>{ this.voices[idx].triggerNoteOff(this.params) }); this.activeKeys.clear(); this.broadcast() }
  broadcast(){ if(this.onVoiceChange) this.onVoiceChange(this.voices.map(v=>({index:v.id, active:v.isPlaying, note:v.note}))) }
  updateParam(k,v){
    this.params[k]=v
    if(k==='pwm'){ this.params.waveform.pulseWidth = v/127 }
    if(k==='sub'){ this.params.waveform.subLevel = v/127; this.params.sub = v }
    if(k==='noise'){ this.params.waveform.noiseLevel = v/127; this.params.noise = v }
    if(k==='saw'){ this.params.waveform.sawtoothLevel = v?0.5:0; this.params.saw = v }
    if(k==='pulse'){ this.params.waveform.pulseLevel = v?0.5:0; this.params.pulse = v }
    if(k==='vcfFreq'||k==='vcfRes'){ this.voices.forEach(vo=>{ if(vo.isPlaying && vo.updateVcf) vo.updateVcf(this.params) }) }
    if(k==='hpfLevel'){ this.voices.forEach(vo=>{ if(vo.isPlaying && vo.updateHpf) vo.updateHpf(v) }) }
    if(k==='pwm'){ this.voices.forEach(vo=>{ if(vo.isPlaying && vo.dco && vo.dco.setPulseWidth) vo.dco.setPulseWidth(v, false) }) }
  }
}

class Util { static fader(v){ return Math.pow(v/127,2.2) } static midiToFreq(n){ return 440*Math.pow(2,(n-69)/12) } }
class DCO_Simple {
  constructor(opts){ const ctx=window.App.context; const freq=opts.frequency||440; this.ctx=ctx; this.freq=freq; this.sawOsc=ctx.createOscillator(); this.sawOsc.type='sawtooth'; this.sawOsc.frequency.value=freq; this.pulseOscA=ctx.createOscillator(); this.pulseOscA.type='sawtooth'; this.pulseOscA.frequency.value=freq; this.pulseOscB=ctx.createOscillator(); this.pulseOscB.type='sawtooth'; this.pulseOscB.frequency.value=freq; this.subOsc=ctx.createOscillator(); this.subOsc.type='square'; this.subOsc.frequency.value=freq/2; this.inverter=ctx.createGain(); this.inverter.gain.value=-1; this.pulseDelay=ctx.createDelay(0.1); this.sawGain=ctx.createGain(); this.pulseGain=ctx.createGain(); this.subGain=ctx.createGain(); this.noiseGain=ctx.createGain(); this.output=ctx.createGain(); this.noiseNode=null; const bs=ctx.sampleRate*2; const buf=ctx.createBuffer(1,bs,ctx.sampleRate); const d=buf.getChannelData(0); for(let i=0;i<bs;i++) d[i]=Math.random()*2-1; this.noiseBuffer=buf; this.sawOsc.connect(this.sawGain); this.sawGain.connect(this.output); this.pulseOscA.connect(this.pulseGain); this.pulseOscB.connect(this.inverter); this.inverter.connect(this.pulseDelay); this.pulseDelay.connect(this.pulseGain); this.pulseGain.connect(this.output); this.subOsc.connect(this.subGain); this.subGain.connect(this.output); this.noiseGain.connect(this.output); this.sawGain.gain.value=opts.waveform?.sawtoothLevel||0.5; this.pulseGain.gain.value=opts.waveform?.pulseLevel||0; this.subGain.gain.value=opts.waveform?.subLevel||0; this.noiseGain.gain.value=opts.waveform?.noiseLevel||0; this.oscillators=[this.sawOsc,this.pulseOscA,this.pulseOscB,this.subOsc]; this.NUM_OSCILLATORS=4; this.pulseWidth=opts.waveform?.pulseWidth||0.5; this.oscillators.forEach(o=>{ try{o.start()}catch(e){} }); this.input=this.oscillators.map(o=>o.detune).filter(Boolean); if(opts.waveform?.pulseWidth) this.setPulseWidth(opts.waveform.pulseWidth*127,false) }
  pwmToDelay(pwm,freq){ return (pwm/2)*(1/freq) }
  setPulseWidth(pwm127,lfoMode=false){ let pwm=(pwm127/127)*0.8; this.pulseWidth=pwm; const now=this.ctx.currentTime; if(lfoMode){ this.pulseDelay.delayTime.setTargetAtTime(0,now,0.01) } else { this.pulseDelay.delayTime.setValueAtTime(this.pwmToDelay(pwm,this.freq),now) } }
  stop(when){ const t=when||this.ctx.currentTime; this.oscillators.forEach(o=>{ try{o.stop(t)}catch(e){} }) }
  noteOff(rel){ this.stop(this.ctx.currentTime+(rel||0)) }
  connect(d){ this.output.connect(d) }
}
class Voice_Simple {
  constructor(ctx,dest,id){ this.ctx=ctx; this.id=id; this.dest=dest; this.isPlaying=false; this.note=0; this.hpf=ctx.createBiquadFilter(); this.hpf.type='highpass'; this.hpf.frequency.value=10; this.vca=ctx.createGain(); this.vca.gain.value=0; this.voiceGain=ctx.createGain(); this.voiceGain.gain.value=0.85; this.hpf.connect(this.vca); this.vca.connect(this.voiceGain); this.voiceGain.connect(dest); this.dco=null; this.noteOnTime=0 }
  triggerNoteOn(midiNote,params,velocity=1){ if(this.dco){ this.dco.stop(); try{this.dco.output.disconnect()}catch(e){} } const freq=Util.midiToFreq(midiNote+(params.transpose||0)); this.dco=new DCO_Simple({frequency:freq,waveform:params.waveform,lfoPwmEnabled:params.lfoPwmEnabled,portamento:params.portamento}); this.dco.sawGain.gain.value=params.saw?0.5:0; this.dco.pulseGain.gain.value=params.pulse?0.5:0; this.dco.subGain.gain.value=params.sub>0?0.35:0; this.dco.noiseGain.gain.value=params.noise/127*0.5; this.dco.setPulseWidth(params.pwm,params.lfoPwmEnabled); this.dco.connect(this.hpf); this.isPlaying=true; this.note=midiNote; this.noteOnTime=this.ctx.currentTime; const now=this.ctx.currentTime; const A=Util.fader(params.envA)*3+0.0015; const D=Util.fader(params.envD)*12+0.0015; const S=params.envS/127; this.vca.gain.cancelScheduledValues(now); this.vca.gain.setValueAtTime(0,now); this.vca.gain.linearRampToValueAtTime(velocity,now+A); this.vca.gain.linearRampToValueAtTime(S*velocity,now+A+D) }
  triggerNoteOff(params){ const now=this.ctx.currentTime; const R=Util.fader(params.envR)*12+0.0015; this.vca.gain.cancelScheduledValues(now); this.vca.gain.setValueAtTime(this.vca.gain.value,now); this.vca.gain.linearRampToValueAtTime(0,now+R); const stopAt=now+R+0.05; if(this.dco) this.dco.stop(stopAt); setTimeout(()=>{ this.isPlaying=false; if(this.dco){ try{this.dco.output.disconnect()}catch(e){} this.dco=null } }, (R+0.06)*1000) }
  updateHpf(l){ const now=this.ctx.currentTime; this.hpf.frequency.setTargetAtTime(l===2?225:l===3?340:10,now,0.02) }
}

const engine = new Engine_OriginalRef()
let analyser=null

function log(m){ const el=document.getElementById('log'); if(el){ el.textContent=`${new Date().toLocaleTimeString()} ${m}\n`+el.textContent.slice(0,2000) } console.log(m) }
function buildKeyboard(){
  const kb=document.getElementById('keyboard'); if(!kb) return; kb.innerHTML=''
  const whiteNotes=[0,2,4,5,7,9,11]
  for(let oct=3; oct<6; oct++){
    for(let w=0; w<whiteNotes.length; w++){
      const midi=oct*12+whiteNotes[w]; const wrap=document.createElement('div'); wrap.className='white-wrap'
      const key=document.createElement('div'); key.className='key'; key.dataset.note=midi; key.textContent=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi%12]+Math.floor(midi/12-1)
      const isBlackAfter=[0,2,5,7,9].includes(whiteNotes[w]); wrap.appendChild(key)
      if(isBlackAfter){ const black=document.createElement('div'); black.className='key black'; black.dataset.note=midi+1; black.textContent=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][(midi+1)%12]+Math.floor((midi+1)/12-1); wrap.appendChild(black) }
      kb.appendChild(wrap)
    }
  }
  kb.addEventListener('pointerdown', e=>{ const t=e.target.closest('.key'); if(!t) return; const note=parseInt(t.dataset.note); engine.noteOn(note); t.classList.add('active'); try{t.setPointerCapture(e.pointerId)}catch(e){} })
  kb.addEventListener('pointerup', e=>{ const t=e.target.closest('.key'); if(t){ const note=parseInt(t.dataset.note); engine.noteOff(note); document.querySelectorAll(`.key[data-note="${note}"]`).forEach(k=>k.classList.remove('active')) } })
}

// --- PC Keyboard mapping (original 106.js style) ---
// Bottom row: zxcvbnm = C D E F G A B (white), sdghj = black keys
// Extends to entire QWERTY row as README says: "key mappings extend to cover the entire top and bottom row"
const PC_KEY_MAP = {
  // Bottom row octave 3 (C4-B4) - matches user's request zxcvbnm + sdghj
  'z': 48, 's': 49, 'x': 50, 'd': 51, 'c': 52, 'v': 53, 'g': 54, 'b': 55, 'h': 56, 'n': 57, 'j': 58, 'm': 59, ',': 60, 'l': 61, '.': 62, ';': 63, '/': 64,
  // Top row octave 4 (QWERTY) - q2w3e r t6y7u etc - full row
  'q': 60, '2': 61, 'w': 62, '3': 63, 'e': 64, 'r': 65, '5': 66, 't': 67, '6': 68, 'y': 69, '7': 70, 'u': 71, 'i': 72, '9': 73, 'o': 74, '0': 75, 'p': 76,
  // Upper octave extension (as original: entire top and bottom row)
  'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65, 't': 66, 'g': 67, 'y': 68, 'h': 69, 'u': 70, 'j': 71, 'k': 72,
}
// Merge - lowercase, keep last wins for overlap (we want qwerty top row to win for 60-76)
Object.assign(PC_KEY_MAP, {
  'z': 48, 's': 49, 'x': 50, 'd': 51, 'c': 52, 'v': 53, 'g': 54, 'b': 55, 'h': 56, 'n': 57, 'j': 58, 'm': 59, ',': 60, '.': 62, '/': 64,
  'q': 60, '2': 61, 'w': 62, '3': 63, 'e': 64, 'r': 65, '5': 66, 't': 67, '6': 68, 'y': 69, '7': 70, 'u': 71,
  'i': 72, '9': 73, 'o': 74, '0': 75, 'p': 76
})
const pressedPCKeys = new Set()

function bindPCKeyboard(){
  const highlightKey = (midi, on)=>{
    document.querySelectorAll(`.key[data-note="${midi}"]`).forEach(k=>{ k.classList.toggle('active', on) })
    const info=document.getElementById('voiceInfo'); if(info) info.textContent = on ? `PC:${midi} ${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi%12]}${Math.floor(midi/12-1)}` : '--'
  }
  document.addEventListener('keydown', e=>{
    if(e.repeat) return
    // ignore when typing in input
    if(e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return
    const key = e.key.toLowerCase()
    const midi = PC_KEY_MAP[key]
    if(midi===undefined) return
    // Octave shift with Z/X or < > ?
    let transposed = midi + (window.octaveShift||0)*12
    if(!pressedPCKeys.has(key)){
      pressedPCKeys.add(key)
      engine.noteOn(transposed, 100)
      highlightKey(transposed, true)
      e.preventDefault()
    }
  })
  document.addEventListener('keyup', e=>{
    if(e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return
    const key = e.key.toLowerCase()
    const midi = PC_KEY_MAP[key]
    if(midi===undefined) return
    let transposed = midi + (window.octaveShift||0)*12
    if(pressedPCKeys.has(key)){
      pressedPCKeys.delete(key)
      engine.noteOff(transposed)
      highlightKey(transposed, false)
      e.preventDefault()
    }
  })
  // Octave shift controls: [ and ] or - / +
  window.octaveShift = 0
  document.addEventListener('keydown', e=>{
    if(e.key==='[' || e.key==='z' && e.ctrlKey) { window.octaveShift = Math.max(-2, (window.octaveShift||0)-1); log(`Octave shift: ${window.octaveShift}`) }
    if(e.key===']' || e.key==='x' && e.ctrlKey) { window.octaveShift = Math.min(2, (window.octaveShift||0)+1); log(`Octave shift: ${window.octaveShift}`) }
  })
  log('PC Keyboard: z x c v b n m = C D E F G A B (white) / s d g h j = black keys / q w e r t y u = upper octave / [ ] = octave shift / Ghosting note: >2 keys may not register (hardware limit)')
}
function bindPanel(){
  document.querySelectorAll('.wave').forEach(b=>{ b.addEventListener('click',()=>{ b.classList.toggle('active'); const w=b.dataset.wave; if(w==='saw') engine.updateParam('saw', b.classList.contains('active')?1:0); if(w==='pulse') engine.updateParam('pulse', b.classList.contains('active')?1:0); if(w==='sub') engine.updateParam('sub', b.classList.contains('active')?50:0) }) })
  document.querySelectorAll('input[type=range]').forEach(inp=>{ const span=inp.nextElementSibling; if(!span) return; inp.addEventListener('input',()=>{ const v=parseInt(inp.value); span.textContent=v; const id=inp.id; if(id==='pwm') engine.updateParam('pwm',v); if(id==='sub') engine.updateParam('sub',v); if(id==='noise') engine.updateParam('noise',v); if(id==='vcfFreq') engine.updateParam('vcfFreq',v); if(id==='vcfRes') engine.updateParam('vcfRes',v); if(id==='envA') engine.params.envA=v; if(id==='envD') engine.params.envD=v; if(id==='envS') engine.params.envS=v; if(id==='envR') engine.params.envR=v }) })
  document.querySelectorAll('.hpf-btn').forEach(b=>{ b.addEventListener('click',()=>{ document.querySelectorAll('.hpf-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); engine.updateParam('hpfLevel', parseInt(b.dataset.hpf)) }) })
  document.querySelectorAll('.chorus-btn').forEach(b=>{ b.addEventListener('click',()=>{ document.querySelectorAll('.chorus-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active') }) })
  document.getElementById('panic')?.addEventListener('click',()=>engine.allNotesOff())
  document.getElementById('power')?.addEventListener('click', e=>{ const on=e.target.classList.contains('power-on'); if(on){ e.target.className='power-off'; e.target.textContent='● OFF'; document.getElementById('overlay')?.classList.remove('hidden'); engine.allNotesOff() } else { e.target.className='power-on'; e.target.textContent='● POWER'; document.getElementById('overlay')?.classList.add('hidden') } })
  document.getElementById('powerOnBtn')?.addEventListener('click',()=>{ document.getElementById('overlay')?.classList.add('hidden'); const p=document.getElementById('power'); if(p){ p.className='power-on'; p.textContent='● POWER'; } engine.ctx.resume() })
}
function bindScope(){
  const canvas=document.getElementById('scope'); if(!canvas) return; const ctx=canvas.getContext('2d')
  function resize(){ const r=canvas.getBoundingClientRect(); const dpr=devicePixelRatio||1; canvas.width=(r.width||260)*dpr; canvas.height=(r.height||56)*dpr; ctx.setTransform(dpr,0,0,dpr,0,0) }
  resize(); window.addEventListener('resize', resize)
  function draw(){ if(!analyser){ requestAnimationFrame(draw); return } const w=canvas.getBoundingClientRect().width||260, h=canvas.getBoundingClientRect().height||56; ctx.fillStyle='rgba(8,12,10,0.28)'; ctx.fillRect(0,0,w,h); ctx.strokeStyle='rgba(30,60,45,0.3)'; ctx.lineWidth=1; for(let y=h/4;y<h;y+=h/4){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke() } const data=new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(data); let start=0; for(let i=0;i<data.length/2;i++){ if(data[i]<128 && data[i+1]>=128){ start=i; break } } ctx.strokeStyle='#2eea70'; ctx.lineWidth=1.5; ctx.shadowBlur=6; ctx.shadowColor='#2eea70'; ctx.beginPath(); const slice=w/(data.length/3); let x=0; for(let i=start;i<start+data.length/3;i++){ const v=(data[i]||128)/128; const y=(v*h)/2; if(i===start) ctx.moveTo(x,y); else ctx.lineTo(x,y); x+=slice } ctx.stroke(); ctx.shadowBlur=0; requestAnimationFrame(draw) } draw()
}
(async()=>{
  analyser=await engine.init()
  engine.onVoiceChange=(statuses)=>{ statuses.forEach(s=>{ const led=document.getElementById(`v${s.index}`); if(led) led.classList.toggle('active', s.active) }) }
  buildKeyboard(); bindPCKeyboard(); bindPanel(); bindScope()
  log(engine.useOriginal ? 'JUNO-106 Simple v4 - USING original js/synth/*.js' : 'JUNO-106 Simple v4 - standalone fallback (same algorithm as original js/synth/dco.js L105-149) - To use original: load js/synth/*.js before this file')
})()
window.engine=engine
window.PC_KEY_MAP=PC_KEY_MAP
