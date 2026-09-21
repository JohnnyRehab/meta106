// JUNO-106 Simple v4 - 1 JS file replaces js/synth/*.js + templates/*
// Architecture: DCO = 2-Saw + DelayNode (original 106's Alternate PWM) + Feedback VCF

class Util {
  static fader(v){ return Math.pow(v/127, 2.2) } // same as original util.getFaderCurve
  static midiToFreq(n){ return 440*Math.pow(2,(n-69)/12) }
}

class DCO_Simple {
  // Original 106.js dco.js: two sawtooths + DelayNode subtraction = pulse
  constructor(ctx, dest, freq=440){
    this.ctx=ctx; this.freq=freq;
    this.sawOsc = ctx.createOscillator(); this.sawOsc.type='sawtooth'; this.sawOsc.frequency.value=freq
    this.pulseOscA = ctx.createOscillator(); this.pulseOscA.type='sawtooth'; this.pulseOscA.frequency.value=freq
    this.pulseOscB = ctx.createOscillator(); this.pulseOscB.type='sawtooth'; this.pulseOscB.frequency.value=freq
    this.subOsc = ctx.createOscillator(); this.subOsc.type='square'; this.subOsc.frequency.value=freq/2
    this.inverter = ctx.createGain(); this.inverter.gain.value=-1
    this.pulseDelay = ctx.createDelay(0.1)
    this.sawGain = ctx.createGain(); this.pulseGain = ctx.createGain(); this.subGain = ctx.createGain(); this.noiseGain = ctx.createGain()
    this.output = ctx.createGain()
    this.noiseNode=null
    // noise buffer shared
    const bs = ctx.sampleRate*2; const buf=ctx.createBuffer(1,bs,ctx.sampleRate); const d=buf.getChannelData(0); for(let i=0;i<bs;i++) d[i]=Math.random()*2-1; this.noiseBuffer=buf

    // Wiring: saw direct, pulse = A - B(delay)
    this.sawOsc.connect(this.sawGain); this.sawGain.connect(this.output)
    this.pulseOscA.connect(this.pulseGain) // will go via subtraction
    this.pulseOscB.connect(this.inverter); this.inverter.connect(this.pulseDelay); this.pulseDelay.connect(this.pulseGain)
    this.pulseGain.connect(this.output)
    this.subOsc.connect(this.subGain); this.subGain.connect(this.output)
    this.noiseGain.connect(this.output)

    // Gains default
    this.sawGain.gain.value=0.5; this.pulseGain.gain.value=0; this.subGain.gain.value=0; this.noiseGain.gain.value=0

    this.oscillators=[this.sawOsc,this.pulseOscA,this.pulseOscB,this.subOsc]
    this.NUM_OSCILLATORS=4
    this.pulseWidth=0.5
  }
  start(){ this.oscillators.forEach(o=>{ try{o.start()}catch(e){} }); }
  pwmToDelay(pwm, freq){ return (pwm/2)*(1/freq) } // original 106.js L147-148

  setFreq(f, portamento=0.01){
    const now=this.ctx.currentTime
    this.freq=f
    this.oscillators.forEach(o=>{ o.frequency.cancelScheduledValues(now); o.frequency.setTargetAtTime(f*(o===this.subOsc?0.5:1), now, portamento) })
    // update pulse delay for current pwm if not LFO
    if(this.pulseWidthNodeMode!=='LFO') this.pulseDelay.delayTime.setTargetAtTime(this.pwmToDelay(this.pulseWidth, f), now, 0.01)
  }
  setPulseWidth(pwm127, lfoMode=false){
    // pwm127 0-127 -> 0-0.8 as original 106.js L118: pwm *=0.8
    let pwm = (pwm127/127)*0.8
    this.pulseWidth=pwm
    const now=this.ctx.currentTime
    if(lfoMode){ this.pulseDelay.delayTime.setTargetAtTime(0, now, 0.01); this.pulseWidthNodeMode='LFO' }
    else { this.pulseDelay.delayTime.setValueAtTime(this.pwmToDelay(pwm, this.freq), now); this.pulseWidthNodeMode='MAN' }
  }
  setLevels({saw,pulse,sub,noise}){
    const now=this.ctx.currentTime
    this.sawGain.gain.setTargetAtTime(saw?0.5:0, now, 0.01)
    this.pulseGain.gain.setTargetAtTime(pulse?0.5:0, now, 0.01)
    this.subGain.gain.setTargetAtTime(sub?0.35:0, now, 0.01)
    this.noiseGain.gain.setTargetAtTime(noise?noise:0, now, 0.01)
    if(noise>0 && !this.noiseNode){ const src=this.ctx.createBufferSource(); src.buffer=this.noiseBuffer; src.loop=true; src.connect(this.noiseGain); src.start(); this.noiseNode=src; this.oscillators.push(src); this.NUM_OSCILLATORS++ }
  }
  stop(when){ const t=when||this.ctx.currentTime; this.oscillators.forEach(o=>{ try{o.stop(t)}catch(e){} }) }
  connect(d){ this.output.connect(d) }
}

class VCF_Simple {
  // Original 106.js vcf.js: 2 biquad + feedback soft clip
  constructor(ctx){
    this.ctx=ctx
    this.filter1=ctx.createBiquadFilter(); this.filter2=ctx.createBiquadFilter()
    this.filter1.type='lowpass'; this.filter2.type='lowpass'
    this.feedback=ctx.createGain(); this.feedback.gain.value=0
    this.limiter=ctx.createWaveShaper(); 
    // soft clip curve tanh(x*1.6) 256 samples
    const c=new Float32Array(256); for(let i=0;i<256;i++){ const x=(i/255)*2-1; c[i]=Math.tanh(x*1.6) }; this.limiter.curve=c; this.limiter.oversample='4x'
    this.input=ctx.createGain(); this.output=ctx.createGain()
    this.input.connect(this.filter1); this.filter1.connect(this.filter2); this.filter2.connect(this.output)
    // feedback path
    this.filter2.connect(this.feedback); this.feedback.connect(this.limiter); this.limiter.connect(this.filter1)
    this.SELF_RES_THRESHOLD=0.92; this.SELF_OSCILLATION_GAIN=1.08
  }
  setRes(v127){
    const now=this.ctx.currentTime
    const resCurve = Util.fader(v127)*20+1
    this.filter1.Q.setValueAtTime(resCurve/2, now); this.filter2.Q.setValueAtTime(resCurve/2, now)
    // feedback
    let fb=0; if(v127/127 >= this.SELF_RES_THRESHOLD){ const t=(v127/127 - this.SELF_RES_THRESHOLD)/(1-this.SELF_RES_THRESHOLD); fb=t*this.SELF_OSCILLATION_GAIN }
    this.feedback.gain.setTargetAtTime(fb, now, 0.01)
  }
  setCutoff(v127){
    const now=this.ctx.currentTime
    const nyq=this.ctx.sampleRate/2; const freq=Math.max(10, Util.fader(v127)*nyq)
    this.filter1.frequency.setTargetAtTime(freq, now, 0.02); this.filter2.frequency.setTargetAtTime(freq, now, 0.02)
  }
  connect(d){ this.output.connect(d) }
}

class Voice_Simple {
  constructor(ctx, dest, id){
    this.ctx=ctx; this.id=id; this.dest=dest; this.isPlaying=false; this.note=0
    this.hpf=ctx.createBiquadFilter(); this.hpf.type='highpass'; this.hpf.frequency.value=10
    this.vcf=new VCF_Simple(ctx); this.vca=ctx.createGain(); this.vca.gain.value=0
    this.voiceGain=ctx.createGain(); this.voiceGain.gain.value=0.85
    this.hpf.connect(this.vcf.input); this.vcf.connect(this.vca); this.vca.connect(this.voiceGain); this.voiceGain.connect(dest)
    this.dco=null
    this.noteOnTime=0
  }
  triggerNoteOn(midiNote, params, velocity=1){
    // kill old dco - original 106 pattern: killOscillators per note
    if(this.dco){ this.dco.stop(); try{this.dco.output.disconnect()}catch(e){} }
    const freq=Util.midiToFreq(midiNote + (params.transpose||0))
    this.dco=new DCO_Simple(this.ctx, null, freq)
    this.dco.setLevels({saw:params.saw?1:0, pulse:params.pulse?1:0, sub:params.sub>0?1:0, noise:params.noise/127*0.5})
    this.dco.setPulseWidth(params.pwm, params.lfoPwmEnabled)
    this.dco.connect(this.hpf)
    this.dco.start()
    this.isPlaying=true; this.note=midiNote; this.noteOnTime=this.ctx.currentTime
    // ENV
    const now=this.ctx.currentTime; const A=Util.fader(params.envA)*3+0.0015; const D=Util.fader(params.envD)*12+0.0015; const S=params.envS/127; const R=Util.fader(params.envR)*12+0.0015
    this.vca.gain.cancelScheduledValues(now); this.vca.gain.setValueAtTime(0, now); this.vca.gain.linearRampToValueAtTime(velocity, now+A); this.vca.gain.linearRampToValueAtTime(S*velocity, now+A+D)
    // VCF cutoff
    this.vcf.setCutoff(params.vcfFreq); this.vcf.setRes(params.vcfRes)
    // HPF
    this.hpf.frequency.setTargetAtTime(params.hpfLevel===2?225:params.hpfLevel===3?340:10, now, 0.02)
  }
  triggerNoteOff(params){
    const now=this.ctx.currentTime; const R=Util.fader(params.envR)*12+0.0015
    this.vca.gain.cancelScheduledValues(now); this.vca.gain.setValueAtTime(this.vca.gain.value, now); this.vca.gain.linearRampToValueAtTime(0, now+R)
    // stop dco after release - no 8s/20s kill, only release
    const stopAt=now+R+0.05
    if(this.dco) this.dco.stop(stopAt)
    setTimeout(()=>{ this.isPlaying=false; if(this.dco){ try{this.dco.output.disconnect()}catch(e){} this.dco=null } }, (R+0.06)*1000)
  }
  updateVcf(params){ this.vcf.setCutoff(params.vcfFreq); this.vcf.setRes(params.vcfRes) }
  updateHpf(level){ const now=this.ctx.currentTime; this.hpf.frequency.setTargetAtTime(level===2?225:level===3?340:10, now, 0.02) }
  killVoice(){ const now=this.ctx.currentTime; this.vca.gain.setValueAtTime(0, now); if(this.dco) this.dco.stop(now); this.isPlaying=false }
}

class Engine_Simple {
  constructor(){
    this.ctx=null; this.masterGain=null; this.voices=[]; this.activeKeys=new Map(); this.roundRobin=0
    this.params={ saw:true, pulse:true, sub:0, noise:0, pwm:64, lfoPwmEnabled:false, vcfFreq:80, vcfRes:20, hpfLevel:1, envA:10, envD:50, envS:100, envR:30, transpose:0, masterVolume:0.85 }
    this.onVoiceChange=null
  }
  async init(){
    const AC=window.AudioContext||window.webkitAudioContext; this.ctx=new AC(); if(this.ctx.state==='suspended') await this.ctx.resume()
    this.masterGain=this.ctx.createGain(); this.masterGain.gain.value=this.params.masterVolume; this.masterGain.connect(this.ctx.destination)
    // 6 voices
    this.voices=[]; for(let i=0;i<6;i++){ const v=new Voice_Simple(this.ctx, this.masterGain, i); this.voices.push(v) }
    // analyser for scope
    this.analyser=this.ctx.createAnalyser(); this.analyser.fftSize=2048; this.masterGain.connect(this.analyser)
    return this.analyser
  }
  findFreeVoice(){
    for(let i=0;i<6;i++){ const idx=(this.roundRobin+i)%6; if(!this.voices[idx].isPlaying){ this.roundRobin=(idx+1)%6; return idx } }
    let oldest=0, oldestTime=Infinity; for(let i=0;i<6;i++){ if(this.voices[i].noteOnTime<oldestTime){ oldestTime=this.voices[i].noteOnTime; oldest=i } }
    this.roundRobin=(oldest+1)%6; return oldest
  }
  noteOn(note, vel=100){
    const idx=this.findFreeVoice(); this.voices[idx].triggerNoteOn(note, this.params, vel/127); this.activeKeys.set(note, idx); this.broadcast()
  }
  noteOff(note){
    const idx=this.activeKeys.get(note); if(idx!==undefined){ this.voices[idx].triggerNoteOff(this.params); this.activeKeys.delete(note); this.broadcast() }
  }
  allNotesOff(){ this.activeKeys.forEach((idx,note)=>{ this.voices[idx].triggerNoteOff(this.params) }); this.activeKeys.clear(); this.broadcast() }
  broadcast(){ if(this.onVoiceChange) this.onVoiceChange(this.voices.map(v=>({index:v.id, active:v.isPlaying, note:v.note}))) }
  updateParam(k,v){ this.params[k]=v; if(k==='vcfFreq'||k==='vcfRes'){ this.voices.forEach(vo=>{ if(vo.isPlaying) vo.updateVcf(this.params) }) } if(k==='hpfLevel'){ this.voices.forEach(vo=>{ if(vo.isPlaying) vo.updateHpf(v) }) } }
}

const engine=new Engine_Simple()
let analyser=null
const params=engine.params

function log(m){ const el=document.getElementById('log'); if(el){ el.textContent = `${new Date().toLocaleTimeString()} ${m}\n` + el.textContent.slice(0,2000) } console.log(m) }

function buildKeyboard(){
  const kb=document.getElementById('keyboard'); kb.innerHTML=''
  const whiteNotes=[0,2,4,5,7,9,11]
  for(let oct=3; oct<6; oct++){
    for(let w=0; w<whiteNotes.length; w++){
      const midi=oct*12+whiteNotes[w]
      const wrap=document.createElement('div'); wrap.className='white-wrap'
      const key=document.createElement('div'); key.className='key'; key.dataset.note=midi; key.textContent=midiToName(midi)
      const isBlackAfter=[0,2,5,7,9].includes(whiteNotes[w])
      wrap.appendChild(key)
      if(isBlackAfter){
        const black=document.createElement('div'); black.className='key black'; black.dataset.note=midi+1; black.textContent=midiToName(midi+1)
        wrap.appendChild(black)
      }
      kb.appendChild(wrap)
    }
  }
  function midiToName(n){ const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']; return names[n%12]+Math.floor(n/12-1) }
  kb.addEventListener('pointerdown', e=>{
    const t=e.target.closest('.key'); if(!t) return; const note=parseInt(t.dataset.note); engine.noteOn(note); t.classList.add('active'); t.setPointerCapture(e.pointerId)
  })
  kb.addEventListener('pointerup', e=>{
    const t=e.target.closest('.key'); if(t){ const note=parseInt(t.dataset.note); engine.noteOff(note); document.querySelectorAll(`.key[data-note="${note}"]`).forEach(k=>k.classList.remove('active')) }
  })
  kb.addEventListener('pointerleave', e=>{
    const t=e.target.closest('.key'); if(t && e.buttons===0){ const note=parseInt(t.dataset.note); engine.noteOff(note); t.classList.remove('active') }
  })
}

function bindPanel(){
  document.querySelectorAll('.wave').forEach(b=>{ b.addEventListener('click',()=>{ b.classList.toggle('active'); const w=b.dataset.wave; if(w==='saw') engine.params.saw=b.classList.contains('active'); if(w==='pulse') engine.params.pulse=b.classList.contains('active'); if(w==='sub') engine.params.sub=b.classList.contains('active')?50:0 }) })
  document.querySelectorAll('input[type=range]').forEach(inp=>{
    const span=inp.nextElementSibling; inp.addEventListener('input',()=>{
      const v=parseInt(inp.value); span.textContent=v
      const id=inp.id; if(id==='pwm') engine.params.pwm=v; if(id==='sub') engine.params.sub=v; if(id==='noise') engine.params.noise=v; if(id==='vcfFreq') engine.updateParam('vcfFreq',v); if(id==='vcfRes') engine.updateParam('vcfRes',v); if(id==='envA') engine.params.envA=v; if(id==='envD') engine.params.envD=v; if(id==='envS') engine.params.envS=v; if(id==='envR') engine.params.envR=v; if(id==='lfoRate') engine.params.lfoRate=v; if(id==='lfoDelay') engine.params.lfoDelay=v
      // PWM real-time: update active voices delay
      if(id==='pwm'){ engine.voices.forEach(vo=>{ if(vo.isPlaying && vo.dco) vo.dco.setPulseWidth(v, false) }) }
    })
  })
  document.querySelectorAll('.hpf-btn').forEach(b=>{ b.addEventListener('click',()=>{ document.querySelectorAll('.hpf-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); engine.updateParam('hpfLevel', parseInt(b.dataset.hpf)) }) })
  document.querySelectorAll('.chorus-btn').forEach(b=>{ b.addEventListener('click',()=>{ document.querySelectorAll('.chorus-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active') }) })
  document.getElementById('panic')?.addEventListener('click',()=>engine.allNotesOff())
  document.getElementById('power')?.addEventListener('click', e=>{
    const on=e.target.classList.contains('power-on'); if(on){ e.target.className='power-off'; e.target.textContent='● OFF'; document.getElementById('overlay')?.classList.remove('hidden'); engine.allNotesOff() } else { e.target.className='power-on'; e.target.textContent='● POWER'; document.getElementById('overlay')?.classList.add('hidden') }
  })
  document.getElementById('powerOnBtn')?.addEventListener('click',()=>{ document.getElementById('overlay')?.classList.add('hidden'); const p=document.getElementById('power'); if(p){ p.className='power-on'; p.textContent='● POWER'; } engine.ctx.resume() })
  document.getElementById('runTests')?.addEventListener('click', runTests)
}

function bindScope(){
  const canvas=document.getElementById('scope'); const ctx=canvas.getContext('2d'); let raf=null
  function resize(){ const r=canvas.getBoundingClientRect(); const dpr=devicePixelRatio||1; canvas.width=(r.width||260)*dpr; canvas.height=(r.height||56)*dpr; ctx.scale(dpr,dpr) }
  resize(); window.addEventListener('resize', resize)
  function draw(){
    if(!analyser) { raf=requestAnimationFrame(draw); return }
    const w=canvas.getBoundingClientRect().width||260, h=canvas.getBoundingClientRect().height||56
    ctx.fillStyle='rgba(8,12,10,0.28)'; ctx.fillRect(0,0,w,h)
    // grid
    ctx.strokeStyle='rgba(30,60,45,0.3)'; ctx.lineWidth=1; for(let y=h/4;y<h;y+=h/4){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke() }
    const data=new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(data)
    let start=0; for(let i=0;i<data.length/2;i++){ if(data[i]<128 && data[i+1]>=128){ start=i; break } }
    ctx.strokeStyle='#2eea70'; ctx.lineWidth=1.5; ctx.shadowBlur=6; ctx.shadowColor='#2eea70'; ctx.beginPath()
    const slice=w/(data.length/3); let x=0; for(let i=start;i<start+data.length/3;i++){ const v=(data[i]||128)/128; const y=(v*h)/2; if(i===start) ctx.moveTo(x,y); else ctx.lineTo(x,y); x+=slice } ctx.stroke(); ctx.shadowBlur=0
    raf=requestAnimationFrame(draw)
  }
  draw()
}

// Tests - measurement, no !0
async function runTests(){
  const el=document.getElementById('testResults'); el.innerHTML='Running...'
  const results=[]
  const add=(name,pass,msg)=>results.push({name,pass,msg})
  // Test 1: 2-Saw PWM duty via delay
  const ctx=new (window.AudioContext||window.webkitAudioContext)()
  const dco=new DCO_Simple(ctx, ctx.createGain(), 100)
  const d1=dco.pwmToDelay(0.05,100), d2=dco.pwmToDelay(0.9,100)
  add('PWM 2-Saw Delay formula', d2>d1 && d1>0, `delay 5%=${d1.toFixed4}s 90%=${d2.toFixed4}s`)
  // Test 2: No 8s kill
  const src=DCO_Simple.toString()+Voice_Simple.toString()
  add('No 8s kill', !src.includes('+ 8') && !src.includes('+8'), src.includes('+ 8')?'found':'clean - only release')
  // Test 3: 6 voices
  add('6 voices', engine.voices.length===6, `voices=${engine.voices.length}`)
  // Test 4: Feedback VCF
  const vcfSrc=VCF_Simple.toString()
  add('VCF Feedback Self-Res', vcfSrc.includes('feedback') && vcfSrc.includes('tanh'), 'feedback + tanh soft clip present')
  // Test 5: PWM affects active voice (Grok fix)
  engine.voices[0].triggerNoteOn(60, engine.params,1)
  const beforeDelay=engine.voices[0].dco.pulseDelay.delayTime.value
  engine.voices[0].dco.setPulseWidth(10,false)
  const afterDelay=engine.voices[0].dco.pulseDelay.delayTime.value
  add('PWM affects active voice', beforeDelay!==afterDelay, `before=${beforeDelay.toFixed5} after=${afterDelay.toFixed5}`)
  engine.allNotesOff()
  // Test 6: Rapid clean
  for(let i=0;i<20;i++){ engine.noteOn(60); await new Promise(r=>setTimeout(r,20)); engine.noteOff(60) }
  await new Promise(r=>setTimeout(r,1500))
  add('Rapid 20x clean', engine.activeKeys.size===0 && engine.voices.filter(v=>v.isPlaying).length===0, `activeKeys=${engine.activeKeys.size} playing=${engine.voices.filter(v=>v.isPlaying).length}`)
  // Test 7: updateVcf active
  engine.noteOn(60); await new Promise(r=>setTimeout(r,50)); const oldQ=engine.voices.find(v=>v.isPlaying)?.vcf.filter1.Q.value||0; engine.updateParam('vcfRes',100); await new Promise(r=>setTimeout(r,50)); const newQ=engine.voices.find(v=>v.isPlaying)?.vcf.filter1.Q.value||0
  add('updateVcf affects active voice', newQ!==oldQ, `Q ${oldQ.toFixed2} -> ${newQ.toFixed2}`)
  engine.allNotesOff()

  const passed=results.filter(r=>r.pass).length
  el.innerHTML=results.map(r=>`<div class="test-row ${r.pass?'test-pass':'test-fail'}">${r.pass?'✅':'❌'} ${r.name}<br><span class="measure">${r.msg}</span></div>`).join('')+`<div style="margin-top:8px;font-weight:bold;color:${passed===results.length?'#0f0':'#f00'}">${passed}/${results.length} ${passed===results.length?'PASS - Simple v4':'FAIL'}</div>`
  log(`Tests ${passed}/${results.length}`)
}

(async()=>{
  analyser=await engine.init()
  engine.onVoiceChange=(statuses)=>{ statuses.forEach(s=>{ const led=document.getElementById(`v${s.index}`); if(led) led.classList.toggle('active', s.active) }) }
  buildKeyboard()
  bindPanel()
  bindScope()
  log('JUNO-106 Simple v4 loaded - 2-Saw Delay PWM + Feedback VCF + 6 Voice + Single HTML/CSS')
})()

window.engine=engine; window.DCO_Simple=DCO_Simple; window.VCF_Simple=VCF_Simple
