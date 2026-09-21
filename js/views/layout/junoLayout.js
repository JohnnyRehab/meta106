define([
    'backbone',
    'application',
    'util',
    'views/layout/moduleLayout',
    'views/layout/sequencerLayout',
    'views/item/keyboardItemView',
    'views/modal/shareItemView',
    'synth/voice',
    'synth/lfo',
    'synth/sequencerClock',
    'synth/distortion',
    'synth/ringModulator',
    'tuna',
    'models/junoModel',
    'models/sequencerModel',
    'models/stepCollection',
    'hbs!tmpl/layout/junoLayout-tmpl'
    ],
    
    function(Backbone, App, util, ModuleLayout, SequencerLayout, KeyboardItemView,
        ShareItemView, Voice, LFO, SequencerClock, Distortion, RingModulator, Tuna, JunoModel, SequencerModel, StepCollection, Template) {

        var MAX_POLYPHONY = 6;
        
        return Backbone.Marionette.LayoutView.extend({
            
            className: 'juno-container',
            
            template: Template,
            
            regions: {
                synthRegion: '.js-synth-region',
                sequencerRegion: '.js-sequencer-region',
                keyboardRegion: '.js-keyboard-region',
                readmeRegion: '.js-readme-region'
            },
            
            initialize: function() {
                this.activeVoices = [];
                this.currentBend = 0;
                this.synth = new JunoModel();
                
                // Step sequencer data. The step-grid UI itself isn't wired
                // up yet, but keeping these here lets EXPORT/IMPORT work
                // against real, persisted data from day one.
                this.sequencerModel = new SequencerModel();
                this.stepCollection = new StepCollection();

                // Cache the initialized synth for later resetting
                this.cachedSynth = JSON.stringify(this.synth.attributes);
                
                // The Tuna library provides overdrive/delay effects; a
                // custom Distortion and RingModulator fill in effects
                // tuna.js doesn't include. All four sit on the master bus
                // (after every voice's chorus stage), wired once here
                // rather than per-voice, and each is live-updatable via
                // synthUpdateHandler -> setEffectParam.
                var tuna = new Tuna(App.context);
                this.cho = new tuna.Chorus();
                this.cho.chorusLevel = this.synth.get('cho-chorusToggle');
                
                this.dis = new Distortion({
                    drive: this.synth.get('dis-drive'),
                    tone: this.synth.get('dis-tone'),
                    bypass: !this.synth.get('dis-active')
                });
                
                this.drv = new tuna.Overdrive({
                    outputGain: 0.5,
                    drive: this.synth.get('drv-drive'),
                    curveAmount: 0.5,
                    algorithmIndex: 3,
                    bypass: !this.synth.get('drv-active')
                });
                
                // tuna.Overdrive has no tone control of its own, so a
                // plain lowpass filter follows it to serve the same role
                // as Distortion's built-in tone stage. Both drv and
                // drvTone are wrapped in a dry/wet crossfade (drvDry/
                // drvWet/drvMix) so that toggling OVER DRIVE off silences
                // the tone filter too, instead of leaving it permanently
                // inline on the master bus.
                this.drvTone = App.context.createBiquadFilter();
                this.drvTone.type = 'lowpass';
                this.applyOverdriveTone(this.synth.get('drv-tone'));
                
                this.drvDry = App.context.createGain();
                this.drvWet = App.context.createGain();
                this.drvMix = App.context.createGain();
                
                this.dly = new tuna.Delay({
                    delayTime: util.getFaderCurve(this.synth.get('dly-time')) * 980 + 20,
                    feedback: this.synth.get('dly-feedback') * 0.9,
                    wetLevel: this.synth.get('dly-mix'),
                    dryLevel: 1,
                    cutoff: 8000,
                    bypass: !this.synth.get('dly-active')
                });
                
                this.rng = new RingModulator({
                    frequency: this.synth.get('rng-freq'),
                    mix: this.synth.get('rng-mix'),
                    bypass: !this.synth.get('rng-active')
                });
                                
                this.masterGain = App.context.createGain();
                this.masterGain.gain.value = 0.5;
                
                this.cho.connect(this.dis.input);
                this.dis.connect(this.drvDry);
                this.dis.connect(this.drv.input);
                this.drv.connect(this.drvTone);
                this.drvTone.connect(this.drvWet);
                this.drvDry.connect(this.drvMix);
                this.drvWet.connect(this.drvMix);
                this.drvMix.connect(this.rng.input);
                this.rng.connect(this.dly.input);
                this.dly.connect(this.masterGain);
                this.masterGain.connect(App.context.destination);
                
                this.applyOverdriveBypass(!this.synth.get('drv-active'));

                this.lfo = new LFO({
                    lfoRate: this.synth.get('lfo-rate'),
                    lfoPitch: this.synth.get('lfo-pitch'),
                    lfoDelay: this.synth.get('lfo-delay'),
                    lfoFreq: this.synth.get('lfo-freq'),
                    lfoPwmEnabled: this.synth.get('dco-lfoPwmEnabled'),
                    lfoPwm: this.synth.get('dco-pwm')
                });

                this.midiListener = Backbone.Wreqr.radio.channel('midi').vent;
                this.patchListener = Backbone.Wreqr.radio.channel('patch').vent;
                
                this.listenTo(this.patchListener, 'load', this.loadPatch);
                this.listenTo(this.midiListener, 'message', this.handleMidi);
                this.listenTo(this.synth, 'change', this.synthUpdateHandler);
            },
            
            onShow: function() {
                this.moduleLayout = new ModuleLayout({
                    synth: this.synth
                });
                this.synthRegion.show(this.moduleLayout);
                
                this.sequencerLayout = new SequencerLayout({
                    sequencerModel: this.sequencerModel,
                    stepCollection: this.stepCollection
                });
                this.sequencerRegion.show(this.sequencerLayout);
                this.listenTo(this.sequencerLayout, 'sequencer:play', this.startSequencer);
                this.listenTo(this.sequencerLayout, 'sequencer:stop', this.stopSequencer);
                
                this.keyboardView = new KeyboardItemView();
                this.keyboardRegion.show(this.keyboardView);
                
                this.listenTo(this.keyboardView, 'noteOn', this.noteOnHandler);
                this.listenTo(this.keyboardView, 'noteOff', this.noteOffHandler);


                // Stop all notes when the window is hidden
                document.addEventListener('visibilitychange', function() {
                    if(document.hidden) {
                        this.allNotesOff();
                    }
                }.bind(this), false);
            },
            
            noteOnHandler: function(note, frequency) {
                var currentNote;
                var portamentoAmount = this.synth.get('dco-portamento');
                
                for(var i = 0; i < this.activeVoices.length; i++) {
                    if(this.activeVoices[i].note === note) {
                        currentNote = this.activeVoices[i];
                    }
                }

                // Portamento: if enabled and a different note is played
                // legato (i.e. another voice is still held), glide that
                // voice's pitch to the new note instead of spawning a new
                // one, mirroring how the hardware's per-voice glide works.
                if(portamentoAmount > 0 && !currentNote && this.activeVoices.length > 0) {
                    var glideVoice = this.activeVoices[this.activeVoices.length - 1];
                    glideVoice.glideTo(frequency);
                    glideVoice.note = note;
                    return;
                }
            
                var voice = new Voice({
                    synthOptions: this.synth.getOptions(frequency),
                    lfo: this.lfo,
                    cho: this.cho
                });
                
                if(currentNote) {
                    currentNote.stealNote();
                    this.stopListening(currentNote);
                    this.activeVoices = _.without(this.activeVoices, currentNote);
                }

                // Kill the oldest note if we hit the max number of simultaneous notes
                if(this.activeVoices.length === MAX_POLYPHONY) {
                    this.stopListening(this.activeVoices[0]);
                    this.activeVoices[0].stealNote();
                    this.activeVoices.shift();
                }
                
                voice.noteOn();
                voice.bend(this.currentBend);
                voice.note = note;
                this.activeVoices.push(voice);
            },
            
            noteOffHandler: function(note) {
                var currentNote;
                
                for(var i = 0; i < this.activeVoices.length; i++) {
                    if(this.activeVoices[i].note === note) {
                        currentNote = this.activeVoices[i];
                    }
                }
                            
                if(currentNote) {
                    this.listenToOnce(currentNote, 'killVoice', function() {
                        this.activeVoices = _.without(this.activeVoices, currentNote);
                    });
                    currentNote.noteOff();
                }

            },

            allNotesOff: function() {
                this.activeVoices.forEach(function(voice) {
                    voice.stealNote();
                }, this);
            },
            
            handleMidi: function(message) {
                var note;
                var frequency;
                var length;
                
                if(message.type === 'noteOn') {
                    frequency = util.frequencyFromMidiNote(message.value);
                    note = util.noteFromMidiNumber(message.value);
                    this.noteOnHandler(note, frequency);
                } else if(message.type === 'noteOff') {
                    note = util.noteFromMidiNumber(message.value);
                    this.noteOffHandler(note);
                } else if(message.type === 'CC') {
                    length = $('[data-param="' + message.param + '"]').data().length;
                    if(length !== undefined) {
                        if(message.value === 1) {
                            message.value = length - 1;
                        } else {
                            message.value = Math.floor(message.value * length);
                        }
                    }
                    this.synth.set(message.param, message.value);
                    this.moduleLayout.updateComponentUIState(message.param);
                } else if(message.type === 'pitchBend') {
                    this.handleBend(message.value);
                }
            },
            
            // Bender: value is normalized -1 to +1, converted here to
            // cents and applied to every currently sounding voice. The
            // last bend position is remembered so a note played while the
            // bender is held off-center inherits the current offset.
            handleBend: function(value) {
                var BEND_RANGE_CENTS = 200; // +/- 2 semitones, matches the hardware's default range
                
                this.currentBend = value * BEND_RANGE_CENTS;
                
                _.each(this.activeVoices, function(voice) {
                    voice.bend(this.currentBend);
                }, this);
            },
            
            synthUpdateHandler: function(update) {
                var param = Object.keys(update.changed)[0];
                var value = update.changed[param];
                var component = param.slice(0, 3);
                var attr = param.slice(4);
                
                // The four master-bus effects (dis/drv/dly/rng) live on
                // the shared signal chain, not per-voice, so they're
                // updated directly rather than via voice[component][attr].
                if(this.setEffectParam(component, attr, value)) {
                    return;
                }
                
                _.each(this.activeVoices, function(voice) {
                    voice[component][attr] = value;
                });
            },
            
            setEffectParam: function(component, attr, value) {
                var effectSetters = {
                    dis: this.updateDistortion,
                    drv: this.updateOverdrive,
                    dly: this.updateDelay,
                    rng: this.updateRingMod
                };
                
                if(!effectSetters[component]) {
                    return false;
                }
                
                effectSetters[component].call(this, attr, value);
                return true;
            },
            
            updateDistortion: function(attr, value) {
                if(attr === 'active') {
                    this.dis.bypass = !value;
                } else if(attr === 'drive') {
                    this.dis.drive = value;
                } else if(attr === 'tone') {
                    this.dis.tone = value;
                }
            },
            
            updateOverdrive: function(attr, value) {
                if(attr === 'active') {
                    this.applyOverdriveBypass(!value);
                } else if(attr === 'drive') {
                    this.drv.drive = value;
                } else if(attr === 'tone') {
                    this.applyOverdriveTone(value);
                }
            },
            
            // Crossfades drvDry/drvWet so that, when OVER DRIVE is off,
            // the signal skips both tuna.Overdrive *and* the drvTone
            // filter entirely, rather than relying on tuna's own bypass
            // (which only covers the Overdrive node itself).
            applyOverdriveBypass: function(bypass) {
                var now = App.context.currentTime;
                this.drv.bypass = bypass;
                this.drvWet.gain.setTargetAtTime(bypass ? 0 : 1, now, 0.01);
                this.drvDry.gain.setTargetAtTime(bypass ? 1 : 0, now, 0.01);
            },
            
            applyOverdriveTone: function(value) {
                var minFreq = 300;
                var maxFreq = App.context.sampleRate / 2;
                this.drvTone.frequency.setValueAtTime(
                    minFreq * Math.pow(maxFreq / minFreq, value),
                    App.context.currentTime
                );
            },
            
            updateDelay: function(attr, value) {
                if(attr === 'active') {
                    this.dly.bypass = !value;
                } else if(attr === 'time') {
                    this.dly.delayTime = util.getFaderCurve(value) * 980 + 20;
                } else if(attr === 'feedback') {
                    this.dly.feedback = value * 0.9;
                } else if(attr === 'mix') {
                    this.dly.wetLevel = value;
                }
            },
            
            updateRingMod: function(attr, value) {
                if(attr === 'active') {
                    this.rng.bypass = !value;
                } else if(attr === 'freq') {
                    this.rng.frequency = value;
                } else if(attr === 'mix') {
                    this.rng.mix = value;
                }
            },
            
            handleReset: function() {
                this.synth.set(JSON.parse(this.cachedSynth));
                Backbone.Wreqr.radio.channel('patch').vent.trigger('reset');
                this.moduleLayout.updateUIState();
            },
            
            loadPatch: function(attributes) {
                var update = {};
                var attr;
                
                _.each(attributes, function(attributePair) {
                    attr = attributePair.split('=');
                    update[attr[0]] = parseFloat(attr[1]);
                });
                
                this.synth.set(update);
                if(this.moduleLayout) {
                    this.moduleLayout.updateUIState();
                }
            },
            
            sharePatch: function() {
                var url;
                var paramString = '';
                var attributes = _.pairs(this.synth.attributes);
                var patchName = Backbone.Wreqr.radio.channel('global').reqres.request('patchName');
                
                _.each(attributes, function(attributePair) {
                    paramString += '?' + attributePair[0] + '=' + parseFloat(attributePair[1].toFixed(6));
                });
                
                url = window.location.origin + window.location.pathname + '#patch/' +
                    encodeURIComponent(patchName) + paramString;

                App.modal.show(new ShareItemView({
                    name: patchName,
                    url: url
                }));
            },
            
            // Step sequencer JSON export: serializes the sequencer's
            // global settings and all 64 steps into a single JSON file
            // and triggers a browser download. No server round-trip
            // needed since everything lives in the browser already.
            exportSequence: function() {
                var patchName = Backbone.Wreqr.radio.channel('global').reqres.request('patchName');
                var data = {
                    version: 1,
                    sequencer: this.sequencerModel.toJSON(),
                    steps: this.stepCollection.toJSON()
                };
                var blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                var url = URL.createObjectURL(blob);
                var filename = (patchName || 'juno106-sequence').toLowerCase().replace(/\s+/g, '-');
                var link = document.createElement('a');
                
                link.href = url;
                link.download = filename + '.json';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            },
            
            // Step sequencer JSON import: reads a file selected via the
            // header's hidden file input, validates it loosely, and
            // replaces the current sequencer settings and steps with its
            // contents.
            importSequence: function(file) {
                var reader = new FileReader();
                
                reader.onload = _.bind(function(e) {
                    var data;
                    
                    try {
                        data = JSON.parse(e.target.result);
                    } catch(err) {
                        window.alert('Could not read sequence file: the file is not valid JSON.');
                        return;
                    }
                    
                    if(!data || !data.sequencer || !_.isArray(data.steps)) {
                        window.alert('Could not read sequence file: unrecognized format.');
                        return;
                    }
                    
                    this.sequencerModel.set(data.sequencer);
                    this.stepCollection.reset(data.steps);
                    
                    // Lets a future step-grid view know it should re-render.
                    Backbone.Wreqr.radio.channel('sequencer').vent.trigger('imported');
                }, this);
                
                reader.onerror = function() {
                    window.alert('Could not read the selected file.');
                };
                
                reader.readAsText(file);
            },
            
            // Lazily creates the clock on first PLAY so it always reads
            // the current sequencerModel/stepCollection.
            startSequencer: function() {
                if(!this.sequencerClock) {
                    this.sequencerClock = new SequencerClock({
                        onStep: _.bind(this.sequencerStepHandler, this),
                        getTotalSteps: _.bind(function() {
                            return this.stepCollection.length;
                        }, this),
                        getTempo: _.bind(function() {
                            return {
                                bpm: this.sequencerModel.get('bpm'),
                                swing: this.sequencerModel.get('swing'),
                                stepDivision: this.sequencerModel.get('stepDivision')
                            };
                        }, this)
                    });
                }
                
                this.sequencerModel.set('playing', true);
                this.sequencerClock.start();
            },
            
            stopSequencer: function() {
                if(this.sequencerClock) {
                    this.sequencerClock.stop();
                }
                this.sequencerModel.set('playing', false);
                
                if(this.lastSequencerNote) {
                    this.noteOffHandler(this.lastSequencerNote);
                    this.lastSequencerNote = null;
                    this.lastSequencerVoice = null;
                }
            },
            
            // Called by SequencerClock once per step, at (approximately)
            // the moment that step should sound. Reuses the same
            // noteOnHandler/noteOffHandler/glideTo used by the keyboard
            // and MIDI input, so sequenced notes share the same 6-voice
            // pool, portamento, and effects chain.
            //
            // Note: because the underlying envelope modules (env.js)
            // always time their ramps from "now" rather than an explicit
            // future AudioContext time, note-on/off here fire via
            // setTimeout rather than true sample-accurate scheduling.
            // Step *timing* stays drift-free (SequencerClock computes it
            // from the audio clock), but there can be a few ms of jitter
            // on exactly when a note starts, same as most JS timers.
            sequencerStepHandler: function(stepIndex) {
                var step = this.stepCollection.at(stepIndex);
                var noteId = 'seq-' + stepIndex;
                var frequency;
                var gateMs;
                
                this.sequencerModel.set('currentStep', stepIndex);
                
                if(!step || !step.get('active')) {
                    return;
                }
                
                frequency = util.frequencyFromMidiNote(step.get('note'));
                gateMs = this.sequencerClock.secondsPerStep() * step.get('gateLength') * 1000;
                
                if(step.get('slide') && this.lastSequencerVoice) {
                    this.lastSequencerVoice.glideTo(frequency);
                    this.lastSequencerVoice.note = noteId;
                } else {
                    if(this.lastSequencerNote) {
                        this.noteOffHandler(this.lastSequencerNote);
                    }
                    this.noteOnHandler(noteId, frequency);
                    this.lastSequencerVoice = _.findWhere(this.activeVoices, {note: noteId});
                }
                
                this.lastSequencerNote = noteId;
                
                window.setTimeout(_.bind(function() {
                    if(this.lastSequencerNote === noteId) {
                        this.noteOffHandler(noteId);
                        this.lastSequencerNote = null;
                        this.lastSequencerVoice = null;
                    }
                }, this), gateMs);
            }
            
        });
    });