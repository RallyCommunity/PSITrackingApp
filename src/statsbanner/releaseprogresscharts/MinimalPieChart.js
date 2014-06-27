(function(){
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.releasetracking.statsbanner.iterationprogresscharts.MinimalPieChart", {
        alias: "widget.statsbannerminimalpiechart",
        extend: "Rally.apps.releasetracking.statsbanner.iterationprogresscharts.PieChart",

        _loadArtifacts: function() {
            this._chartData = [];
            this._childChartData = [];
            this._createDataPointsFromSummary();
        },

        _createDataPointsFromSummary: function() {
            _.each(this.store.getRange(), function(record){
                var summary = record.get('Summary');
                var totalChildItems = record.get('LeafStoryCount');
                var planEstimate = (record.get('PreliminaryEstimate') && record.get('PreliminaryEstimate').Value) || 1;
                var nullPointString = 'No stories.';
                var keys, state, scheduleState, blocked, count;

                var pointSizeForChildren = (planEstimate / totalChildItems) || 1;

                this._addPointForTopLevelItem(record, totalChildItems);

                if (totalChildItems === 0) {
                    this._childChartData.push({
                        name: nullPointString,
                        y: planEstimate,
                        color: '#FFF',
                        rallyName: null,
                        status: '',
                        blocked: false,
                        blockedReason: '',
                        hasChildren: false,
                        relatedCount: 0,
                        ref: null,
                        parentFormattedID: null
                    });
                }
                if (summary.UserStories && summary.UserStories.Count){
                    keys = _.keys(summary.UserStories['schedulestate+blocked']);
                    _.each(keys, function(key) {
                        state = key.split('+');
                        scheduleState =  state[0];
                        blocked = state[1] === 'true';
                        count = summary.UserStories['schedulestate+blocked'][key];
                        _.each(_.range(0, count), function(point) {
                            this._addPointForChildItem(record.get('FormattedID'), pointSizeForChildren, scheduleState, blocked);
                        }, this);
                    }, this);
                }
            }, this);

            var chart = this._createChartConfig();
            this.add(chart);

        },

        _onAllDataLoaded: function() {
            _.each(this.store.getRange(), function(record) {
                var stories = record.get('UserStories');
                var relatedCount = record.get('LeafStoryCount');
                var planEstimate = (record.get('PreliminaryEstimate') && record.get('PreliminaryEstimate')) || 1;
                var pointSizeForChildren = (planEstimate / relatedCount) || 1;
                var nullPointString = 'No stories.';

                this._addPointForTopLevelItem(record, relatedCount);

                if (relatedCount === 0) {
                    this._childChartData.push({
                        name: nullPointString,
                        y: planEstimate,
                        color: '#FFF',
                        rallyName: null,
                        status: '',
                        blocked: false,
                        blockedReason: '',
                        hasChildren: false,
                        relatedCount: 0,
                        ref: null,
                        parentFormattedID: null
                    });
                } else {
                    if (stories && stories.Results) {
                        _.each(stories.Results, function(story) {
                            this._addPointForChildItem(story, record.get('FormattedID'), pointSizeForChildren);
                        }, this);
                    }
                }
            }, this);

            var chart = this._createChartConfig();
            this.add(chart);

            this.recordLoadEnd();
        },

         _createChartConfig: function(overrides) {
            var clickChartHandler = _.isFunction(this.clickHandler) ? this.clickHandler : Ext.emptyFn;
            var height = this.height;
            return Ext.Object.merge({
                xtype: 'rallychart',
                loadMask: false,
                updateAfterRender: Ext.bind(this._onLoad, this),

                chartData: {
                    series: [
                        {
                            type:'pie',
                            name: 'Parents',
                            data: this._chartData,
                            size: height,
                            allowPointSelect: false,
                            dataLabels: {
                                enabled: false
                            }
                        },
                        {
                            type:'pie',
                            name: 'Children',
                            data: this._childChartData,
                            size: height,
                            innerSize: 0.8 * height,
                            allowPointSelect: false,
                            dataLabels: { enabled: false }
                        }
                    ]
                },

                chartConfig: {
                    chart: {
                        type: 'pie',
                        height: height,
                        width: this.width,
                        spacingTop: 0,
                        spacingRight: 0,
                        spacingBottom: 0,
                        spacingLeft: 0,
                        events: {
                            click: clickChartHandler
                        }
                    },
                    tooltip: {
                        formatter: function() {
                            return false;
                        }
                    },
                    spacingTop: 0,
                    title: { text: null },
                    plotOptions: {
                        pie: {
                            shadow: false,
                            center: ['50%', '50%'],
                            point: {
                                events: {
                                    click: clickChartHandler
                                }
                            },
                            showInLegend: false
                        }
                    }
                }
            }, overrides || {});
        },

        _addPointForTopLevelItem: function(record, relatedCount) {
            var blocked = false;
            var pointSize = (record.get('PreliminaryEstimate') && record.get('PreliminaryEstimate').Value) || 1;
            var color = '#C0C0C0';
            var colorObject;

            //if (record.get('PlannedEndDate')) {
              colorObject = Rally.util.HealthColorCalculator.calculateHealthColorForPortfolioItemData(record.data, 'PercentDoneByStoryCount');
              color = colorObject.hex;
            //}
            console.log('colorObject', record.get('Name'), record.get('PercentDoneByStoryCount'), colorObject);
            console.dir(record);

            this._chartData.push({
                name: record.get('FormattedID'),
                y: pointSize,
                color: color,
                rallyName: record.get('Name'),
                status: record.get('State') && record.get('State').Name,
                blocked: blocked,
                blockedReason: blocked ? record.get('BlockedReason') : null,
                hasChildren: relatedCount > 0,
                relatedCount: relatedCount,
                ref: record.get('_ref'),
                parentFormattedID: null
            });
        },

        _addPointForChildItem: function(parentFormattedID, pointSize, state, blocked) {
            var color = this._colorFromStatus(this._storyStates[state], blocked);

            this._childChartData.push({
                y: pointSize,
                color: color,
                status: state,
                blocked: blocked,
                hasChildren: false,
                relatedCount: 0,
                parentFormattedID: parentFormattedID
            });
        }
    });
})();
