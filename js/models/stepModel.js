define([
    'backbone'
],

    function(Backbone) {
        return Backbone.Model.extend({

            defaults: {
                active: false,      // step on/off
                note: 60,            // MIDI note number
                gateLength: 0.5,     // fraction of the step length the gate stays open
                accent: false,
                slide: false         // glide into this step using DCO portamento
            }

        });
    });
