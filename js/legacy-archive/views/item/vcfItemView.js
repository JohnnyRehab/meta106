define([
    'backbone',
    'hbs!tmpl/item/vcfItemView-tmpl',
    'views/item/moduleBaseItemView'
    ],
    
    function(Backbone, Template, ModuleBaseItemView) {
        return ModuleBaseItemView.extend({
            
            className: 'vcf control',
            
            template: Template,
            
            onShow: function() {
                this.styleParent('five');
                this.$el.parent().addClass('module--compact');
                this.bindFaders();
                this.bindSwitches();
                this.setupSwitchPositions();
                this.listenTo(Backbone.Wreqr.radio.channel('synth').vent, 'vcf:selfOscillate', this.toggleSelfOscillating);
            },
            
            toggleSelfOscillating: function(isSelfOscillating) {
                this.$('[data-param="vcf-res"]').toggleClass('fader__knob--self-oscillating', isSelfOscillating);
            }
            
        });
    });