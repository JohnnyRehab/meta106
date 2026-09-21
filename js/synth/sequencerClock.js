define([
    'application'
],

    function(App) {

        // How often the scheduler wakes up to look for steps that need to
        // be queued (ms), and how far ahead of "now" it's willing to queue
        // them (seconds). This is the standard Web Audio "lookahead" clock
        // pattern: the scheduler runs on a plain JS timer, but every step
        // time is computed from App.context.currentTime so tempo stays
        // accurate even if the timer itself jitters.
        var LOOKAHEAD_INTERVAL = 25;
        var SCHEDULE_AHEAD_TIME = 0.1;

        function SequencerClock(options) {
            var onStep = options.onStep;
            var getTotalSteps = options.getTotalSteps;
            var getTempo = options.getTempo;

            var currentStep = 0;
            var nextStepTime = 0;
            var timerId = null;
            var running = false;

            function secondsPerStep() {
                var tempo = getTempo();
                var stepsPerBeat = tempo.stepDivision / 4;
                return (60 / tempo.bpm) / stepsPerBeat;
            }

            // Swing delays every other step by a fraction of a step length.
            function swingDelay(stepIndex) {
                var tempo = getTempo();
                if(stepIndex % 2 === 1) {
                    return secondsPerStep() * (tempo.swing / 100) * 0.5;
                }
                return 0;
            }

            function advance() {
                nextStepTime += secondsPerStep() + swingDelay(currentStep);
                currentStep = (currentStep + 1) % getTotalSteps();
            }

            // Queues the actual callback to fire via setTimeout as close as
            // possible to its scheduled audio-clock time. This keeps step
            // timing itself drift-free (computed from the audio clock)
            // while working with a voice engine that triggers on "now"
            // rather than accepting a future AudioContext time.
            function queueStep(stepIndex, time) {
                var delay = Math.max(0, (time - App.context.currentTime) * 1000);
                window.setTimeout(function() {
                    if(running) {
                        onStep(stepIndex, time);
                    }
                }, delay);
            }

            function scheduler() {
                while(nextStepTime < App.context.currentTime + SCHEDULE_AHEAD_TIME) {
                    queueStep(currentStep, nextStepTime);
                    advance();
                }
                timerId = window.setTimeout(scheduler, LOOKAHEAD_INTERVAL);
            }

            this.start = function() {
                if(running) {
                    return;
                }
                running = true;
                currentStep = 0;
                nextStepTime = App.context.currentTime + 0.05;
                scheduler();
            };

            this.stop = function() {
                running = false;
                window.clearTimeout(timerId);
            };

            this.isRunning = function() {
                return running;
            };

            // Exposed so callers can convert a step's gateLength (0-1)
            // into real milliseconds for scheduling note-off.
            this.secondsPerStep = secondsPerStep;
        }

        return SequencerClock;
    }
);
