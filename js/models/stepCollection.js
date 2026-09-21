define([
    'backbone',
    'models/stepModel'
],

    function(Backbone, StepModel) {

        var TOTAL_STEPS = 64;

        return Backbone.Collection.extend({

            model: StepModel,

            TOTAL_STEPS: TOTAL_STEPS,

            initialize: function() {
                if(this.length === 0) {
                    this.reset(this.createDefaultSteps());
                }
            },

            createDefaultSteps: function() {
                var steps = [];
                var i;

                for(i = 0; i < TOTAL_STEPS; i++) {
                    steps.push(new StepModel());
                }
                return steps;
            }

        });
    });
