(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('Rally.apps.releasetracking.statsbanner.IterationProgressDialogChartToggle', {
        requires:['Rally.ui.Button'],
        extend:'Ext.Container',
        alias:'widget.iterationprogressdialogcharttoggle',
        
        componentCls: 'iteration-progress-toggle-button-group',
        layout: 'hbox',
        border: 1,
        width: 106,
        activeButtonCls: 'active',

        defaultType: 'rallybutton',

        config: {
            startingIndex: 0
        },
        
        items: [{
            cls: 'toggle left pie-chart',
            iconCls: 'icon-pie',
            frame: false,
            toggleGroup: 'iterationprogressviewtoggle',
            style: {
                fontSize: '15px'
            },
            toolTipConfig: {
                html: 'Pie',
                anchor: 'top',
                hideDelay: 0
            },
            userAction:'IterationProgressApp - User clicked pie chart'
        },
        {
            cls: 'toggle center burndown',
            iconCls: 'icon-bars',
            frame: false,
            toggleGroup: 'iterationprogressviewtoggle',
            toolTipConfig: {
                html: 'Burndown',
                anchor: 'top',
                hideDelay: 0
            },
            userAction:'IterationProgressApp - User clicked burndown'
        },
        {
            cls: 'toggle right cumulativeflow',
            iconCls: 'icon-graph',
            frame: false,
            toggleGroup: 'iterationprogressviewtoggle',
            toolTipConfig: {
                html: 'Cumulative Flow',
                anchor: 'top',
                hideDelay: 0
            },
            userAction:'IterationProgressApp - User clicked CFD'
        }],

        initComponent: function(config) {
            this.initConfig(config);
            this.callParent(arguments);

            this.addEvents([
                /**
                 * @event toggle
                 * Fires when the toggle value is changed.
                 * @param {String} toggleState 'burndown' or 'cumulativeflow' or 'pie'.
                 */
                'toggle'
            ]);

            this.items.each(function(item) {
                item.on('click', this._onButtonClick, this);
            }, this);

            this.setCurrentItem(this.startingIndex);
        },

        _onButtonClick: function(btn) {
            var btnIndex = this.items.indexOf(btn);
            if (btnIndex !== this._activeIndex) {
                this._setActive(btn);
                this.fireEvent('toggle', this, btnIndex);
            }
        },

        _setActive: function(btn) {
            this.items.each(function(item, btnIndex) {
                if (item === btn) {
                    if (!item.hasCls(this.activeButtonCls.split(' ')[0])) {
                        item.addCls(this.activeButtonCls);
                        this._activeIndex = btnIndex;
                    }
                } else {
                    item.removeCls(this.activeButtonCls);
                }
            }, this);
        },

        setCurrentItem: function(itemIndex) {
            this._setActive(this.items.get(itemIndex));
        }
    });
})();

