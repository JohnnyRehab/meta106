define([
    'backbone',
    'hbs!tmpl/item/dlyItemView-tmpl',
    'views/item/moduleBaseItemView'
    ],

    function(Backbone, Template, ModuleBaseItemView) {
        return ModuleBaseItemView.extend({

            className: 'dly control',

            template: Template,

            onShow: function() {
                this.styleParent('five');
                this.bindFaders();
                this.bindSwitches();
                this.setupSwitchPositions();
            }

        });
    });
