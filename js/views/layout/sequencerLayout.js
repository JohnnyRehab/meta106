define([
    'backbone',
    'util',
    'views/item/stepItemView',
    'hbs!tmpl/layout/sequencerLayout-tmpl',
    'hbs!tmpl/item/stepEditItemView-tmpl'
],

    function(Backbone, util, StepItemView, Template, StepEditTemplate) {

        var STEPS_PER_BANK = 16;
        var BANK_COUNT = 4;

        return Backbone.Marionette.CompositeView.extend({

            className: 'module module--sequencer seven',

            template: Template,

            childView: StepItemView,

            childViewContainer: '.js-seq-steps',

            ui: {
                play: '.js-seq-play',
                stop: '.js-seq-stop',
                bpm: '.js-seq-bpm',
                swing: '.js-seq-swing',
                banks: '.js-seq-bank'
            },

            triggers: {
                'click @ui.play': 'sequencer:play',
                'click @ui.stop': 'sequencer:stop'
            },

            events: {
                'change @ui.bpm': 'handleBpmChange',
                'change @ui.swing': 'handleSwingChange',
                'click @ui.banks': 'handleBankClick',
                'click .js-note-down': 'decrementNote',
                'click .js-note-up': 'incrementNote',
                'change .js-gate': 'handleGateChange',
                'click .js-accent-toggle': 'toggleAccent',
                'click .js-slide-toggle': 'toggleSlide'
            },
            
            childEvents: {
                'select': 'handleStepSelect'
            },

            initialize: function(options) {
                this.sequencerModel = options.sequencerModel;
                this.collection = options.stepCollection;
                this.currentBank = this.sequencerModel.get('currentBank');
                this.selectedStepIndex = null;

                this.listenTo(this.sequencerModel, 'change:currentStep', this.highlightCurrentStep);
                this.listenTo(this.sequencerModel, 'change:playing', this.updatePlayState);
            },

            // Only the 16 steps belonging to the currently viewed bank are
            // rendered as child views, even though the collection always
            // holds all 64. Playback in junoLayout.js reads directly from
            // the full collection, independent of what's on screen.
            filter: function(child, index) {
                return index >= this.currentBank * STEPS_PER_BANK &&
                    index < (this.currentBank + 1) * STEPS_PER_BANK;
            },

            serializeData: function() {
                return {
                    bpm: this.sequencerModel.get('bpm'),
                    swing: this.sequencerModel.get('swing'),
                    banks: _.map(_.range(BANK_COUNT), function(index) {
                        return {index: index, label: index + 1};
                    })
                };
            },

            onRender: function() {
                this.updateBankButtons();
                this.updatePlayState();
                this.renderStepEdit();
                this.highlightSelectedStep();
            },

            handleBpmChange: function() {
                var bpm = parseInt(this.ui.bpm.val(), 10);
                this.sequencerModel.set('bpm', _.isNaN(bpm) ? 120 : bpm);
            },

            handleSwingChange: function() {
                var swing = parseInt(this.ui.swing.val(), 10);
                this.sequencerModel.set('swing', _.isNaN(swing) ? 0 : swing);
            },

            handleBankClick: function(e) {
                this.currentBank = parseInt($(e.currentTarget).data('bank'), 10);
                this.sequencerModel.set('currentBank', this.currentBank);
                this.render();
            },

            updateBankButtons: function() {
                this.$('.js-seq-bank').removeClass('sequencer__bank-btn--active');
                this.$('.js-seq-bank[data-bank="' + this.currentBank + '"]').addClass('sequencer__bank-btn--active');
            },

            updatePlayState: function() {
                var playing = this.sequencerModel.get('playing');
                this.ui.play.toggleClass('pressed', playing);
                this.ui.stop.toggleClass('pressed', !playing);
            },

            highlightCurrentStep: function() {
                var stepIndex = this.sequencerModel.get('currentStep');
                var bankStart = this.currentBank * STEPS_PER_BANK;
                var childView;

                this.$('.sequencer__step').removeClass('sequencer__step--playing');

                if(stepIndex >= bankStart && stepIndex < bankStart + STEPS_PER_BANK) {
                    childView = this.children.findByModel(this.collection.at(stepIndex));
                    if(childView) {
                        childView.$el.addClass('sequencer__step--playing');
                    }
                }
            },
            
            // Fired via childEvents when a step is clicked (see
            // stepItemView.js's handleClick, which toggles the step and
            // fires 'select' in the same gesture). Selects that step for
            // editing in the panel below the grid.
            handleStepSelect: function(childView) {
                this.selectedStepIndex = this.collection.indexOf(childView.model);
                this.renderStepEdit();
                this.highlightSelectedStep();
            },
            
            highlightSelectedStep: function() {
                var model;
                var childView;
                
                this.$('.sequencer__step').removeClass('sequencer__step--selected');
                
                if(this.selectedStepIndex === null) {
                    return;
                }
                
                model = this.collection.at(this.selectedStepIndex);
                childView = model && this.children.findByModel(model);
                
                if(childView) {
                    childView.$el.addClass('sequencer__step--selected');
                }
            },
            
            renderStepEdit: function() {
                var model = this.selectedStepIndex === null ? null : this.collection.at(this.selectedStepIndex);
                
                if(!model) {
                    this.$('.js-seq-step-edit').empty();
                    return;
                }
                
                this.$('.js-seq-step-edit').html(StepEditTemplate({
                    stepNumber: this.selectedStepIndex + 1,
                    noteName: util.noteFromMidiNumber(model.get('note')),
                    gateLength: model.get('gateLength'),
                    accent: model.get('accent'),
                    slide: model.get('slide')
                }));
            },
            
            getSelectedStep: function() {
                return this.selectedStepIndex === null ? null : this.collection.at(this.selectedStepIndex);
            },
            
            decrementNote: function() {
                var step = this.getSelectedStep();
                if(step) {
                    step.set('note', Math.max(0, step.get('note') - 1));
                    this.renderStepEdit();
                }
            },
            
            incrementNote: function() {
                var step = this.getSelectedStep();
                if(step) {
                    step.set('note', Math.min(127, step.get('note') + 1));
                    this.renderStepEdit();
                }
            },
            
            handleGateChange: function(e) {
                var step = this.getSelectedStep();
                var gateLength = parseFloat($(e.currentTarget).val());
                if(step) {
                    step.set('gateLength', _.isNaN(gateLength) ? 0.5 : gateLength);
                }
            },
            
            toggleAccent: function() {
                var step = this.getSelectedStep();
                if(step) {
                    step.set('accent', !step.get('accent'));
                    this.renderStepEdit();
                }
            },
            
            toggleSlide: function() {
                var step = this.getSelectedStep();
                if(step) {
                    step.set('slide', !step.get('slide'));
                    this.renderStepEdit();
                }
            }

        });
    });
