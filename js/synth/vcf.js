define([
    'application',
    'util'
],
    
    function(App, util) {
        function VCF(options) {
            var that = this;
            
            var envelopeOffset = options.envConstants.envelopeOffset;
            var attackMax = options.envConstants.attackMax;
            var decayReleaseMax = options.envConstants.decayReleaseMax;
            var filterMinimum = 10;
            var SELF_RES_THRESHOLD = 0.92;
            var SELF_OSCILLATION_GAIN = 1.08;
            var selfOscillating = false;
        
            var filter1 = App.context.createBiquadFilter();
            var filter2 = App.context.createBiquadFilter();
            var inverted = options.inverted;
            var envMod = App.context.createGain();
            var offset = createDCOffset();
            var filterEnvelope = App.context.createGain();
            var feedback = App.context.createGain();
            var feedbackLimiter = App.context.createWaveShaper();
            
            var envelope = options.envelope;
            var filterCutoff = getCutoffFreqFromValue(options.frequency);
            var keyFrequency = options.keyFreq;
            var keyFollow = App.context.createGain();
            
            var attackLength;
            var decayLength;
            var sustainLevel;
            var releaseLength;
            
            this.output = filter2;
            this.input = [filter1, filter2];
            this.detune = [filter1.detune, filter2.detune];
            
            function init() {
                filter1.type = 'lowpass';
                filter2.type = 'lowpass';
                filter1.Q.value = getResonanceFromValue(options.res);
                filter2.Q.value = getResonanceFromValue(options.res);
                
                envMod.gain.value = getEnvModAmount(options.vcfEnv);
                keyFollow.gain.value = setKeyFollow(options.keyFollow);
                
                feedback.gain.value = 0;
                feedbackLimiter.curve = createSoftClipCurve();
                feedbackLimiter.oversample = '4x';
                
                setupEnvelope();
                filter1.connect(filter2);
                offset.connect(filterEnvelope);
                filterEnvelope.connect(envMod);
                envMod.connect(filter1.detune);
                envMod.connect(filter2.detune);
                offset.connect(keyFollow);
                keyFollow.connect(filter1.detune);
                keyFollow.connect(filter2.detune);
                
                // Filter self-resonance: feed the output of the second stage
                // back into the first stage once resonance passes
                // SELF_RES_THRESHOLD, soft-clipped to keep the feedback loop
                // bounded instead of clipping hard or blowing up.
                filter2.connect(feedback);
                feedback.connect(feedbackLimiter);
                feedbackLimiter.connect(filter1);
                
                updateSelfResonance(options.res);
            }
            
            function setRes(value) {
                var now = App.context.currentTime;
                var resonance = getResonanceFromValue(value);
                filter1.Q.setValueAtTime(resonance / 2, now);
                filter2.Q.setValueAtTime(resonance / 2, now);
                updateSelfResonance(value);
            }
            
            // Cross-fades in a soft-clipped feedback path as resonance
            // approaches maximum, letting the filter sustain and eventually
            // self-oscillate the way the analog Juno-106 filter can.
            function updateSelfResonance(value) {
                var now = App.context.currentTime;
                var feedbackAmount = getFeedbackAmount(value);
                var isSelfOscillating = value >= SELF_RES_THRESHOLD;
                
                feedback.gain.cancelScheduledValues(now);
                feedback.gain.setTargetAtTime(feedbackAmount, now, 0.01);
                
                if(isSelfOscillating !== selfOscillating) {
                    selfOscillating = isSelfOscillating;
                    Backbone.Wreqr.radio.channel('synth').vent.trigger('vcf:selfOscillate', selfOscillating);
                }
            }
            
            function getFeedbackAmount(value) {
                if(value < SELF_RES_THRESHOLD) {
                    return 0;
                }
                var t = (value - SELF_RES_THRESHOLD) / (1 - SELF_RES_THRESHOLD);
                return t * SELF_OSCILLATION_GAIN;
            }
            
            function createSoftClipCurve() {
                var samples = 256;
                var curve = new Float32Array(samples);
                for(var i = 0; i < samples; i++) {
                    var x = (i / (samples - 1)) * 2 - 1;
                    curve[i] = Math.tanh(x * 1.6);
                }
                return curve;
            }
            
            function setFilter(value) {
                value = value || filterCutoff;
                
                var now = App.context.currentTime;
                filter1.frequency.setValueAtTime(value, now);
                filter2.frequency.setValueAtTime(value, now);
            }
            
            function setKeyFollow(value) {
                var octavesFromMiddleC = Math.log2(keyFrequency / 261.6);
                return value * octavesFromMiddleC * 1200;
            }
            
            function setupEnvelope() {
                attackLength = getAttackLength();
                decayLength = getDecayLength();
                releaseLength = getReleaseLength();
                sustainLevel = getSustainLevel();
            }
            
            function getSustainLevel() {
                return envelope.sustain;
            }
            
            function getAttackLength() {
                return util.getFaderCurve(envelope.attack) * attackMax + envelopeOffset;
            }
            
            function getDecayLength() {
                return util.getFaderCurve(envelope.decay) * decayReleaseMax + envelopeOffset;
            }
            
            function getReleaseLength() {
                return util.getFaderCurve(envelope.release) * decayReleaseMax + envelopeOffset;
            }
            
            function getEnvModAmount(value) {
                // Multiply fader value (0-1) by log2(2200) for total octaves 
                // in filter, then by 1200 for cents/octave; negative value
                // for inverted filter
                return inverted ? -(value * 13323.94537) :
                    value * 13323.94537;
            }
            
            function getResonanceFromValue(value) {
                return util.getFaderCurve(value) * 20 + 1;
            }
            
            function getCutoffFreqFromValue(value) {
                var nyquist = App.context.sampleRate / 2;
                var freq = util.getFaderCurve(value) * nyquist;
                return freq > filterMinimum ? freq : filterMinimum;
            }
            
            function setDecay() {
                var now = App.context.currentTime;
                filterEnvelope.gain.cancelScheduledValues(now);
                filterEnvelope.gain.linearRampToValueAtTime(sustainLevel, now + decayLength);
            }
            
            function setSustain() {
                var now = App.context.currentTime;
                filterEnvelope.gain.setValueAtTime(sustainLevel, now);
            }
            
            // Suggested by Chris Wilson on stackoverflow
            // http://stackoverflow.com/questions/30019666/web-audio-synthesis-how-to-handle-changing-the-filter-cutoff-during-the-attack
            function createDCOffset() {
                var buffer = App.context.createBuffer(1, 1, App.context.sampleRate);
                var data = buffer.getChannelData(0);
                var bufferSource = App.context.createBufferSource();
                data[0] = 1;
                bufferSource.buffer = buffer;
                bufferSource.loop = true;
                bufferSource.start(0);
                return bufferSource;
            }
            
            // Trigger the filter on keypress
            this.noteOn = function(initial) {
                var now = App.context.currentTime;
                
                if(!initial) {
                    initial = 0;
                    setupEnvelope();
                    setFilter();
                }
                
                filterEnvelope.gain.cancelScheduledValues(now);
                filterEnvelope.gain.setValueAtTime(initial, now);
                filterEnvelope.gain.linearRampToValueAtTime(1, now + attackLength);
                filterEnvelope.gain.linearRampToValueAtTime(sustainLevel, now + attackLength + decayLength);
            };
            
            // Release the filter on keyup
            this.noteOff = function(initial) {
                var now = App.context.currentTime;
                
                initial = initial || filterEnvelope.gain.value;
        
                filterEnvelope.gain.cancelScheduledValues(now);
                filterEnvelope.gain.setValueAtTime(initial, now);
                filterEnvelope.gain.linearRampToValueAtTime(0, now + releaseLength);
            };
            
            Object.defineProperties(this, {
                'cutoff': {
                    'set': function(value) { 
                        filterCutoff = getCutoffFreqFromValue(value);
                        setFilter();
                    }
                },
                'envMod': {
                    'set': function(value) { 
                        envMod.gain.value = getEnvModAmount(value);
                    }
                },
                'attack': {
                    'set': function(e) { 
                        var now = App.context.currentTime;
                        var attacking = now < e.timing.attack + attackLength;
                        
                        envelope.attack = e.value;
                        setupEnvelope();
                        if(attacking) {
                            that.noteOn(filterEnvelope.gain.value);
                        }
                    }
                },
                'decay': {
                    'set': function(e) {
                        var now = App.context.currentTime;
                        var decaying = now < e.timing.attack + attackLength + decayLength;
                        
                        envelope.decay = e.value;
                        decayLength = getDecayLength();
                        if(decaying) {
                            setDecay();
                        }
                    }
                },
                'sustain': {
                    'set': function(e) {
                        var now = App.context.currentTime;
                        var sustaining = now > e.timing.attack + attackLength + decayLength && 
                            e.timing.release === null;
                    
                        envelope.sustain = e.value;
                        sustainLevel = getSustainLevel();
                        if(sustaining) {
                            setSustain();
                        }
                    }
                },
                'release': {
                    'set': function(e) {
                        var now = App.context.currentTime;
                        var releasing = e.timing.release && 
                            now < e.timing.release + releaseLength;
                        
                        envelope.release = e.value;
                        setupEnvelope();
                        if(releasing) {
                            that.noteOff();
                        }
                    }
                },
                'res': {
                    'set': function(value) { setRes(value); }
                },
                'invert': {
                    'set': function(value) { inverted = !value; }
                },
                'keyFollow': {
                    'set': function(value) { 
                        var now = App.context.currentTime;
                        keyFollow.gain.setValueAtTime(setKeyFollow(value), now); 
                    }
                }
            });
            
            return init();
            
        }
        
        return VCF;
    }
);