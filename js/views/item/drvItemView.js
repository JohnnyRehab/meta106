define([
    'backbone',
    'hbs!tmpl/item/drvItemView-tmpl',
    'views/item/moduleBaseItemView'
    ],

    function(Backbone, Template, ModuleBaseItemView) {
        return ModuleBaseItemView.extend({

            className: 'drv control',

            template: Template,

            onShow: function() {
                this.styleParent('five');
                this.bindFaders();
                this.bindSwitches();
                this.setupSwitchPositions();
            }

        });
    });
