define([
    'application',
    'util'
],
    
    function(App, util) {
        function DCO(options) {
            
            this.input = [];
            this.output = [];
            this.oscillators = [];
            this.NUM_OSCILLATORS;
            
            var that = this;
            
            var lfoPwmEnabled = options.lfoPwmEnabled;
            var frequencyTargets = [];
            var portamentoTime = util.getFaderCurve(options.portamento || 0) * 1.2 + 0.0005;
            var pulseFrequency = options.frequency;
            var sawtooth = createOsc(options.frequency, 'sawtooth', options.waveform.sawtoothLevel, 1);
            var pulseWidth;
            var pulseWidthNode;
            var pulse = createPwmPulse(options.frequency, options.waveform.pulseWidth, options.waveform.pulseLevel, 1);
            var sub = createOsc(options.frequency / 2, 'square', options.waveform.subLevel, 0.5);
            var noise = createNoise(options.waveform.noiseLevel);
            
            
            function init() { 
                // Start the oscillators, set up mod inputs
                _.each(that.oscillators, function(oscillator) {
                    oscillator.start(0);
                    oscillator.onended = destroyOscillator;
                    if(oscillator.frequency) {
                        that.input.push(oscillator.detune);
                    }
                });

                that.NUM_OSCILLATORS = that.oscillators.length;
            }
            
            function setSubLevel(level) {
                var now = App.context.currentTime;
                sub.gain.cancelScheduledValues(now);
                sub.gain.setValueAtTime(level, now);
            }
        
            function setSawtoothLevel(level) {
                var now = App.context.currentTime;
                sawtooth.gain.cancelScheduledValues(now);
                sawtooth.gain.setValueAtTime(level, now);
            }
            
            function setPulseLevel(level) {
                var now = App.context.currentTime;
                pulse.gain.cancelScheduledValues(now);
                pulse.gain.setValueAtTime(level, now);
            }
            
            function setNoiseLevel(level) {
                var now = App.context.currentTime;
                noise.gain.cancelScheduledValues(now);
                noise.gain.setValueAtTime(level, now);
            }
            
            function setPulseWidth(width) {
                var now = App.context.currentTime;
                
                if(_.isUndefined(width)) {
                    width = pulseWidth;
                }
                pulseWidthNode.cancelScheduledValues(now);
                pulseWidthNode.setValueAtTime(pwmToDelay(width, pulseFrequency), now);
            }
            
            function createNoise(level) {
                var bufferSize = App.context.sampleRate;
                var noiseBuffer = App.context.createBuffer(1, bufferSize, App.context.sampleRate);
                var output = noiseBuffer.getChannelData(0);
                var gain;
                
                for (var i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;       
                }
                whiteNoise = App.context.createBufferSource();
                whiteNoise.buffer = noiseBuffer;
                whiteNoise.loop = true;
                
                gain = App.context.createGain();
                gain.gain.value = level;
                whiteNoise.connect(gain);
                
                that.oscillators.push(whiteNoise);
                that.output.push(gain);
                return gain;
            }
            
            // Alternate PWM implementation: instead of a single sawtooth run
            // through a comparator WaveShaper (hard-edged, prone to
            // aliasing at extreme widths), two band-limited sawtooth
            // oscillators are phase-offset via a DelayNode and subtracted.
            // The subtraction of two identical, phase-shifted sawtooths
            // yields a pulse wave whose duty cycle tracks the delay time,
            // while inheriting the browser's built-in anti-aliasing for
            // the sawtooth waveform.
            function createPwmPulse(frequency, pwm, level, ratio) {
                var oscA = App.context.createOscillator();
                var oscB = App.context.createOscillator();
                var inverter = App.context.createGain();
                var phaseDelay = App.context.createDelay(0.1);
                var gain = App.context.createGain();
                
                oscA.type = 'sawtooth';
                oscB.type = 'sawtooth';
                oscA.frequency.value = frequency;
                oscB.frequency.value = frequency;
                inverter.gain.value = -1;
                
                pwm *= 0.8;
                
                if(lfoPwmEnabled) {
                    phaseDelay.delayTime.value = 0;
                } else {
                    phaseDelay.delayTime.value = pwmToDelay(pwm, frequency);
                }
                
                oscA.connect(gain);
                oscB.connect(inverter);
                inverter.connect(phaseDelay);
                phaseDelay.connect(gain);
                
                gain.gain.value = util.getFaderCurve(level);
                
                that.oscillators.push(oscA);
                that.oscillators.push(oscB);
                that.output.push(gain);
                frequencyTargets.push({node: oscA, ratio: ratio});
                frequencyTargets.push({node: oscB, ratio: ratio});
                
                pulseWidthNode = phaseDelay.delayTime;
                pulseWidth = pwm;
                return gain;
            }
            
            // Converts a 0-0.8 pulse-width fader value into the delay (in
            // seconds) needed to offset oscB by that fraction of the note's
            // period.
            function pwmToDelay(pwm, frequency) {
                return (pwm / 2) * (1 / frequency);
            }
        
            function createOsc(frequency, type, level, ratio) {
                var osc = App.context.createOscillator();
                var gain = App.context.createGain();
                osc.type = type;
                osc.frequency.value = frequency;                
                gain.gain.value = level;
                osc.connect(gain);
                that.oscillators.push(osc);
                that.output.push(gain);
                frequencyTargets.push({node: osc, ratio: ratio});
                return gain;
            }
        
            function destroyOscillator() {
                that.trigger('destroyed');
            }
        
            // Stop the oscillators immediately for note-stealing or after the 
            // release envelope completes
            this.noteOff = function(releaseLength) {
                var now = App.context.currentTime;
                
                releaseLength = releaseLength || 0;
                
                _.each(this.oscillators, function(oscillator) {
                    oscillator.stop(now + releaseLength);
                });
            };
        
            Object.defineProperties(this, {
                'sawtooth': {
                    'set': function(value) { setSawtoothLevel(0.5 * value); }
                },
                'pulse': {
                    'set': function(value) { setPulseLevel(0.5 * value); }
                },
                'sub': {
                    'set': function(value) { setSubLevel(value); }
                },
                'noise': {
                    'set': function(value) { setNoiseLevel(value); }
                },
                'pwm': {
                    'get': function() { return pulseWidthNode; },
                    'set': function(value) { 
                        pulseWidth = value * 0.8;
                        if(!lfoPwmEnabled) {
                            setPulseWidth();
                        }
                        that.trigger('pwm', value);
                    }
                },
                'lfoPwmEnabled': {
                    'set': function(value) {
                        if(value === 1) {
                            setPulseWidth(0);
                        } else {
                            setPulseWidth();
                        }
                        that.trigger('lfoPwmEnabled', value);
                    }
                },
                // Portamento: glides every real oscillator (sawtooth, PWM
                // pair, sub) to a new note frequency using an exponential
                // approach instead of retriggering, so a legato-played
                // voice can be reused instead of stealing a fresh one.
                'frequency': {
                    'set': function(newFrequency) {
                        var now = App.context.currentTime;
                        
                        _.each(frequencyTargets, function(target) {
                            target.node.frequency.cancelScheduledValues(now);
                            target.node.frequency.setTargetAtTime(newFrequency * target.ratio, now, portamentoTime);
                        });
                        
                        pulseFrequency = newFrequency;
                        if(!lfoPwmEnabled) {
                            setPulseWidth();
                        }
                    }
                },
                // Bender: applies a pitch-bend offset (in cents) on top of
                // whatever the oscillators are already doing, without
                // disturbing LFO pitch modulation connected to the same
                // detune params.
                'detuneBend': {
                    'set': function(cents) {
                        var now = App.context.currentTime;
                        
                        _.each(frequencyTargets, function(target) {
                            target.node.detune.setTargetAtTime(cents, now, 0.01);
                        });
                    }
                }
            });
            
            return init();
           
        }
        
        return DCO;
    }
);