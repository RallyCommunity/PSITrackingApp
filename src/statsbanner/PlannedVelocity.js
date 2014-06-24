(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * shows planned velocity for timebox
     */
    Ext.define('Rally.apps.releasetracking.statsbanner.PlannedVelocity', {
        extend: 'Rally.apps.releasetracking.statsbanner.Gauge',
        alias:'widget.statsbannerplannedvelocity',
        require: ['Rally.util.Colors'],

        tpl: [
            '<div class="expanded-widget">',
            '<div class="stat-title">Planned Velocity</div>',
            '<div class="stat-metric">',
            '<div class="metric-chart"></div>',
            '<div class="metric-chart-text percent-offset">',
            '{percentage}<div class="metric-percent">%</div>',
            '</div>',
            '<div class="metric-subtext">{estimate} of {plannedVelocity} {unit}</div>',
            '</div>',
            '</div>',
            '<div class="collapsed-widget">',
            '<div class="stat-title">Planned Velocity</div>',
            '<div class="stat-metric">{percentage}<span class="metric-percent">%</span></div>',
            '</div>'
        ],

        config: {
            data: {
                percentage: 0,
                estimate: 0,
                plannedVelocity: 0,
                unit: ''
            }
        },

        onDataChanged: function() {
            var renderData = this._getRenderData();
            this.update(renderData);

            this.refreshChart(this._getChartConfig(renderData));
        },

        getChartEl: function() {
            return this.getEl().down('.metric-chart');
        },

        _getTimeboxUnits: function() {
            return this.getContext().getTimeboxScope().getType() === 'iteration' ?
                this.getContext().getWorkspace().WorkspaceConfiguration.IterationEstimateUnitName :
                this.getContext().getWorkspace().WorkspaceConfiguration.ReleaseEstimateUnitName;
        },

        _getRenderData: function() {
            var estimate = _.reduce(this.store.getRange(), function(accum, record) {
                return accum + (record.get('PreliminaryEstimate') && record.get('PreliminaryEstimate').Value) || 0;
            }, 0);

            estimate = Math.round(estimate * 100) / 100;

            var timeboxRecord = this.getContext().getTimeboxScope().getRecord();

            var plannedVelocity = (timeboxRecord && timeboxRecord.get('PlannedVelocity')) || 0;

            var percentage = plannedVelocity === 0 ? 0 : Math.round(estimate / plannedVelocity * 100);

            var data = {
                estimate: estimate,
                percentage: percentage,
                plannedVelocity: plannedVelocity,
                unit: this.unitLabel ? this.unitLabel : this._getTimeboxUnits()
            };

            return data;
        },

        _getChartConfig: function(renderData) {
            var percentage = renderData.percentage,
                percentagePlanned = percentage % 100 || 100,
                color = Rally.util.Colors.cyan_med,
                secondaryColor = Rally.util.Colors.grey1;

            if (percentage > 100) {
                color = Rally.util.Colors.blue;
                secondaryColor = Rally.util.Colors.cyan;
            } else if (percentage > 70) {
                color = Rally.util.Colors.cyan;
            } else if (percentage === 0) {
                color = Rally.util.Colors.grey1;
            }

            return {
                chartData: {
                    series: [{
                        data: [
                            {
                                name: 'Planned Estimate Total',
                                y: percentagePlanned,
                                color: color
                            },
                            {
                                name: '',
                                y: 100 - percentagePlanned,
                                color: secondaryColor
                            }
                        ]
                    }]
                }
            };
        }
    });
})();
