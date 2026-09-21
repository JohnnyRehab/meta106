define([
    'backbone',
    'views/layout/choLayout',
    'views/item/disItemView',
    'views/item/drvItemView',
    'views/item/dlyItemView',
    'views/item/rngItemView',
    'hbs!tmpl/layout/moduleLayout-tmpl'
    ],
    
    function(Backbone,
        CHOLayout, DISItemView, DRVItemView, DLYItemView, RNGItemView, Template) {
        return Backbone.Marionette.LayoutView.extend({
            
            className: 'module-layout-container',
            
            template: Template,
            
            regions: {
                choRegion: '.js-cho-region',
                disRegion: '.js-dis-region',
                drvRegion: '.js-drv-region',
                dlyRegion: '.js-dly-region',
                rngRegion: '.js-rng-region'
            },
            
            initialize: function(data) {
                this.synth = data.synth;
                this.modules = this.setupModules();
                this.currentParam = null;
                this.currentValue = null;

            },
            
            setupModules: function() {
                return {
                    cho: new CHOLayout(),
                    dis: new DISItemView(),
                    drv: new DRVItemView(),
                    dly: new DLYItemView(),
                    rng: new RNGItemView()
                };
            },
            
            getRegionName: function(moduleName) {
                return moduleName.toLowerCase() + 'Region';
            },
            
            onShow: function() {
                var regionName;
                _.each(this.modules, function(view, name) {
                    regionName = this.getRegionName(name);
                    this[regionName].show(view);
                    this.listenTo(view, 'update', this.handleModuleUpdate);
                }, this);
                
                this.updateUIState();
            },
            
            updateUIState: function() {
                _.each(this.synth.attributes, function(value, key) {
                    this.updateComponentUIState(key);
                }, this);
            },
            
            updateComponentUIState: function(param) {
                var component = param.slice(0, 3);
                var value = this.synth.get(param);
                
                // Panels migrated to js/es/* (see js/main-es.js) are no
                // longer in this.modules; they keep their own UI synced
                // via store.on('change:...') instead, so there's nothing
                // for this LayoutView to do for their params.
                if(!this.modules[component]) {
                    return;
                }
                
                this.modules[component].updateUIState(param, value);
            },
            
            handleModuleUpdate: function(update) {
                if(update.param === this.currentParam && update.value === this.currentValue) return;
                
                this.synth.set(update.param, update.value);
                this.currentParam = update.param;
                this.currentValue = update.value;
            }
        });
    });