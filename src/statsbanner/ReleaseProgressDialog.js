(function(){

    var Ext = window.Ext4 || window.Ext;

    /**
    * shows burndown for timebox
    */
    Ext.define('Rally.apps.releasetracking.statsbanner.IterationProgressDialog', {
        extend: 'Rally.ui.dialog.Dialog',
        alias:'widget.statsbanneriterationprogressdialog',
        requires: [
            'Rally.apps.releasetracking.statsbanner.IterationProgressDialogChartToggle',
            'Rally.apps.releasetracking.statsbanner.iterationprogresscharts.PieChart',
            'Rally.ui.carousel.Carousel'
        ],
        config: {
            startingIndex: 0,
            autoShow: true,
            draggable: true,
            disableScroll: true,
            width: 820,
            height: 650,
            closable: true,
            store: null,
            context: null,
            lowestLevelPi: 'portfolioitem/feature'
        },
        layout: {
            type: 'vbox',
            align: 'center'
        },
        cls: 'iteration-progress-dialog',

        constructor: function (config){
            this.initConfig(config || {});
            this.callParent(arguments);
        },

        initComponent: function(){
            var chartWidth = 704;
            var chartHeight = 570;

            this.callParent(arguments);
            
            this.carousel = this.add({
                xtype: 'rallycarousel',
                showDots: false,
                enableAnimations: false,
                carouselItems: [
                    {
                        xtype: 'statsbannerpiechart',
                        width: chartWidth,
                        height: chartHeight,
                        context: this.context,
                        lowestLevelPi: this.lowestLevelPi
                    }
                ],
                startingIndex: this.startingIndex,
                listeners: {
                    carouselmove: {
                        fn: this._onCarouselMove,
                        scope: this
                    },
                    afterlayout: {
                        fn: this._afterLayout,
                        single: true,
                        scope: this
                    }
                }
            });
        },

        _toggleButtonClick: function(toggleBtnContainer, buttonIndex){
            this._setChart(buttonIndex);
        },

        _afterLayout: function(){
            Ext.defer(this._setChart, 10, this, [this.startingIndex]);
        },

        _setChart: function(chartIndex) {
            this.carousel.setCurrentItem(chartIndex);
            //this.toggle.setCurrentItem(chartIndex);
            // need to bypass the setTitle method as it causes a relayout of the page messing up the carousel
            this.header.titleCmp.textEl.update(this.carousel.getCurrentItem().displayTitle);
        },

        _onCarouselMove: function(carousel){
            this._setChart(carousel.getCurrentItemIndex());
        }
    });
})();
