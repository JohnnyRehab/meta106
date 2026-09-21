define([
    'backbone'
],

    function(Backbone) {
        return Backbone.Model.extend({

            defaults: {
                bpm: 120,
                swing: 0,
                stepDivision: 16,    // 16, 8, or 32 (notes per bank of 16 steps)
                currentBank: 0,      // 0-3
                playing: false,
                currentStep: 0
            }

        });
    });
