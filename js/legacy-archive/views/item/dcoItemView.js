define([
    'backbone',
    'hbs!tmpl/item/dcoItemView-tmpl',
    'views/item/moduleBaseItemView'
    ],
    
    function(Backbone, Template, ModuleBaseItemView) {
        return ModuleBaseItemView.extend({
            
            className: 'dco control',
            
            template: Template,
            
            onShow: function() {
                this.styleParent('six');
                this.$el.parent().addClass('module--compact');
                this.bindSwitches();
                this.bindButtons();
                this.bindFaders();
                
                this.setupSwitchPositions();
            }
            
        });
    });