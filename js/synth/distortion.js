define([
    'application',
    'util'
],

    function(App, util) {

        // A harder-clipping companion to tuna.Overdrive. Where Overdrive
        // uses a soft, tube-like curve, this uses an aggressive tanh
        // curve whose steepness scales directly with drive, plus a
        // post-stage lowpass filter for tone shaping (tuna's Overdrive has
        // no tone control of its own).
        //
        // Bypass is implemented as a true dry/wet crossfade around the
        // *entire* wet chain (waveshaper + tone filter), not just a null
        // waveshaper curve — otherwise the tone filter would keep coloring
        // the signal even while "off".
        function Distortion(options) {
            var input = App.context.createGain();
            var waveshaper = App.context.createWaveShaper();
            var toneFilter = App.context.createBiquadFilter();
            var dryGain = App.context.createGain();
            var wetGain = App.context.createGain();
            var output = App.context.createGain();

            var drive = options.drive || 0;
            var bypass = !!options.bypass;

            input.connect(waveshaper);
            waveshaper.connect(toneFilter);
            toneFilter.connect(wetGain);
            input.connect(dryGain);
            wetGain.connect(output);
            dryGain.connect(output);

            waveshaper.oversample = '4x';
            toneFilter.type = 'lowpass';

            this.input = input;
            this.output = output;

            this.connect = function() {
                output.connect.apply(output, arguments);
                return this;
            };

            this.disconnect = function() {
                output.disconnect.apply(output, arguments);
                return this;
            };

            function buildCurve(amount) {
                var samples = 256;
                var curve = new Float32Array(samples);
                var i;
                var x;
                var steepness = 1 + amount * 40;

                for(i = 0; i < samples; i++) {
                    x = (i / (samples - 1)) * 2 - 1;
                    curve[i] = Math.tanh(x * steepness) / Math.tanh(steepness);
                }
                return curve;
            }

            function applyDrive(value) {
                drive = value;
                waveshaper.curve = buildCurve(drive);
            }

            function applyTone(value) {
                var minFreq = 300;
                var maxFreq = App.context.sampleRate / 2;
                toneFilter.frequency.setValueAtTime(
                    minFreq * Math.pow(maxFreq / minFreq, value),
                    App.context.currentTime
                );
            }

            // Full dry/wet crossfade: when bypassed, the wet chain
            // (waveshaper + tone filter) is silenced entirely and the dry
            // signal passes straight through, so neither the clipping nor
            // the tone filter can color the sound while "off".
            function applyBypass(value) {
                var now = App.context.currentTime;
                bypass = !!value;

                wetGain.gain.setTargetAtTime(bypass ? 0 : 1, now, 0.01);
                dryGain.gain.setTargetAtTime(bypass ? 1 : 0, now, 0.01);
            }

            applyDrive(drive);
            applyTone(options.tone || 0.5);
            applyBypass(bypass);

            Object.defineProperties(this, {
                'drive': {
                    'set': function(value) { applyDrive(value); }
                },
                'tone': {
                    'set': function(value) { applyTone(value); }
                },
                'bypass': {
                    'set': function(value) { applyBypass(value); }
                }
            });
        }

        return Distortion;
    }
);
