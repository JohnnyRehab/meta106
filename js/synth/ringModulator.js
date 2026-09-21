define([
    'application'
],

    function(App) {

        // True ring modulation: a sine-wave carrier oscillator's output is
        // connected directly into a GainNode's .gain AudioParam (an
        // audio-rate connection), which multiplies the incoming signal by
        // the carrier's instantaneous value each sample. Setting the
        // GainNode's own base gain to 0 means the only contribution to
        // its gain is the carrier itself, giving true bipolar
        // multiplication rather than simple amplitude modulation.
        function RingModulator(options) {
            var input = App.context.createGain();
            var carrier = App.context.createOscillator();
            var ringGain = App.context.createGain();
            var dryGain = App.context.createGain();
            var wetGain = App.context.createGain();
            var output = App.context.createGain();

            var mix = _.isUndefined(options.mix) ? 0.5 : options.mix;
            var bypass = !!options.bypass;

            carrier.type = 'sine';
            ringGain.gain.value = 0;

            carrier.connect(ringGain.gain);
            input.connect(ringGain);
            input.connect(dryGain);
            ringGain.connect(wetGain);
            wetGain.connect(output);
            dryGain.connect(output);
            carrier.start(0);

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

            function applyMix(value) {
                var now = App.context.currentTime;
                var wetLevel;
                var dryLevel;

                mix = value;
                wetLevel = bypass ? 0 : mix;
                dryLevel = bypass ? 1 : (1 - mix);

                wetGain.gain.setTargetAtTime(wetLevel, now, 0.01);
                dryGain.gain.setTargetAtTime(dryLevel, now, 0.01);
            }

            function applyFrequency(value) {
                var minFreq = 20;
                var maxFreq = 2000;
                carrier.frequency.setTargetAtTime(
                    minFreq * Math.pow(maxFreq / minFreq, value),
                    App.context.currentTime,
                    0.01
                );
            }

            function applyBypass(value) {
                bypass = !!value;
                applyMix(mix);
            }

            applyFrequency(_.isUndefined(options.frequency) ? 0.3 : options.frequency);
            applyMix(mix);
            applyBypass(bypass);

            Object.defineProperties(this, {
                'frequency': {
                    'set': function(value) { applyFrequency(value); }
                },
                'mix': {
                    'set': function(value) { applyMix(value); }
                },
                'bypass': {
                    'set': function(value) { applyBypass(value); }
                }
            });
        }

        return RingModulator;
    }
);
