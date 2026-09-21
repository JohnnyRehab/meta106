define([
    'backbone',
    'hbs!tmpl/item/stepItemView-tmpl'
],

    function(Backbone, Template) {
        return Backbone.Marionette.ItemView.extend({

            tagName: 'li',

            className: 'sequencer__step',

            template: Template,

            events: {
                'click': 'handleClick'
            },

            modelEvents: {
                'change': 'render'
            },

            // A single click both toggles the step on/off and selects it
            // for editing below the grid — no separate gesture to learn.
            handleClick: function() {
                this.model.set('active', !this.model.get('active'));
                this.trigger('select');
            },

            onRender: function() {
                this.$el.toggleClass('sequencer__step--active', !!this.model.get('active'));
                this.$el.toggleClass('sequencer__step--accent', !!this.model.get('accent'));
                this.$el.toggleClass('sequencer__step--slide', !!this.model.get('slide'));
            }

        });
    });
