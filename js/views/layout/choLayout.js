define([
    'backbone',
    'hbs!tmpl/layout/choLayout-tmpl',
    'views/item/moduleBaseItemView'
    ],
    
    function(Backbone, Template, ModuleBaseItemView) {
        return Marionette.LayoutView.extend({
            
            className: 'control cho',
            
            template: Template,
            
            ui: {
                button: '.button'
            },
            
            initialize: function() {
                var base = new ModuleBaseItemView();
                
                this.events = base.events;
                this.styleParent = base.styleParent;
                this.bindButtons = base.bindButtons;
                this.updateUIState = base.updateUIState;
                this.triggerUpdate = base.triggerUpdate;
                this.setupButtonState = base.setupButtonState;
                this.triggerButton = base.triggerButton;
                this.showContextMenu = base.showContextMenu;
            },
            
            onShow: function() {
                // MIDI status/input-select used to live here (see
                // headerItemView.js, where it lives now); with it gone,
                // CHORUS only needs enough width for its 3 stacked
                // buttons.
                this.styleParent('two');
                this.bindButtons();
            }
            
        });
    });