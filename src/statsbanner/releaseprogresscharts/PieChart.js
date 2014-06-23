(function(){
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.releasetracking.statsbanner.iterationprogresscharts.PieChart", {
        alias: "widget.statsbannerpiechart",
        extend: "Ext.Container",
        requires: [
            'Rally.ui.chart.Chart'
        ],
        mixins: {
            recordable: 'Rally.clientmetrics.ClientMetricsRecordable'
        },

        currentScope: undefined,
        height: undefined,
        width: undefined,
        displayTitle: 'Pie',
        config: {
            context: null
        },

        initComponent: function() {
            this.callParent(arguments);

            if (this._storyStates === undefined) {
                Rally.data.ModelFactory.getModels({
                    types: ['UserStory'],
                    context: this.getContext(),
                    scope: this,
                    requester: this,
                    success: function(models){
                        models.UserStory.getField('ScheduleState').getAllowedValueStore().load({
                            callback: this._createStateMap,
                            requester: this,
                            scope: this
                        });
                    }
                });
            } else {
                this._loadArtifacts();
            }
        },

        _createStateMap: function(allowedValues) {
            var stateMap = ['Defined', 'In-Progress', 'Completed'],
                stateMapIndex = 0,
                storyStates = {};

            _.each(allowedValues, function(value) {
                var state = value.data.StringValue;
                if (state) {
                    if (state === stateMap[stateMapIndex + 1]) {
                        stateMapIndex++;
                    }
                    storyStates[state] = stateMap[stateMapIndex];
                }
            });

            this._storyStates = storyStates;
            this._loadArtifacts();
        },

        _loadArtifacts: function() {
            this._chartData = [];
            this._childChartData = [];

            this.store = Ext.create('Rally.data.wsapi.artifact.Store', {
                models: ['PortfolioItem/Feature'],
                fetch: ['UserStories', 'PreliminaryEstimate', 'Value', 'FormattedID', 'State[Ordinal;Name]', 'LeafStoryCount', 'Name',
                        'PlannedEndDate', 'PlannedStartDate', 'ActualStartDate', 'ActualEndDate', 'PercentDoneByStoryPlanEstimate'],
                filters: [this.context.getTimeboxScope().getQueryFilter()],
                context: this.context.getDataContext(),
                limit: Infinity,
                requester: this,
                autoLoad: true,
                listeners: {
                    load: this._loadChildCollections,
                    scope: this
                }
            });
        },

        _loadChildCollections: function() {
            var records = this.store.getRange();
            var promises = [];
            _.each(records, function(record) {
                if (record.get('UserStories') && record.get('UserStories').Count) {
                  var store = Ext.create('Rally.data.wsapi.Store', {
                      model: 'UserStory',
                      fetch: ['FormattedID', 'Name', 'ScheduleState', 'Blocked', 'BlockedReason', 'Feature'],
                      filters: [{
                        property: 'Feature',
                        value: record.get('_ref')
                      }, {
                        property: 'DirectChildrenCount',
                        value: 0
                      }]
                    });
                    promises.push(store.load({
                        requester: this,
                        callback: function(stories) {
                            record.get('UserStories').Results = stories;
                        }
                    }));
                }
            });

            if (promises.length > 0) {
                Deft.Promise.all(promises).then({
                    success: this._onAllDataLoaded,
                    scope: this
                });
            } else {
                this._onAllDataLoaded();
            }
        },

        _onAllDataLoaded: function() {
            _.each(this.store.getRange(), function(record) {
                var stories = record.get('UserStories');
                var relatedCount = record.get('LeafStoryCount');
                var planEstimate = (record.get('PreliminaryEstimate') && record.get('PreliminaryEstimate').Value) || 1;
                var pointSizeForChildren = (planEstimate / relatedCount) || 1;
                var nullPointString = 'No stories.';

                //console.log(record.get('Name'), relatedCount, planEstimate, pointSizeForChildren);
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

        _onLoad: function() {
            this.fireEvent('contentupdated', this);
            this.fireEvent('ready', this);
            if (Rally.BrowserTest) {
                Rally.BrowserTest.publishComponentReady(this);
            }
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
                    subtitle: {
                        useHTML:true, //class refactor
                        text: '<table align="center" class="pie-chart-legend"><tr><td><span class="legend-swatch defined-sample-swatch"></span><span>Defined</td>' +
                              '<td><span class="legend-swatch in-progress-sample-swatch"></span>In-Progress</td>'+
                              '<td><span class="legend-swatch completed-sample-swatch"></span>Completed</td>'+
                              '<td><span class="legend-swatch blocked-sample-swatch"></span>Blocked</td></tr></table>',
                        verticalAlign: 'bottom',
                        floating: true,
                        x: -50,
                        y: -25
                    },
                    tooltip: {
                        formatter: this._formatTooltip
                    },
                    spacingTop: 0,
                    title: { text: null },
                    plotOptions: {
                        pie: {
                            shadow: false,
                            center: ['50%', '50%'],
                            point: {
                                events: {
                                    click: function(event) {
                                        if (this.ref) {
                                            Rally.nav.Manager.showDetail(this.ref);
                                        }
                                    }
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

            if (record.get('PlannedEndDate')) {
              colorObject = Rally.util.HealthColorCalculator.calculateHealthColorForPortfolioItemData(record, 'PercentDoneByStoryPlanEstimate');
              color = colorObject.hex;
            }

            console.log(record.get('Name'), pointSize, record.get('PreliminaryEstimate') && record.get('PreliminaryEstimate').Value);
            this._chartData.push({
                name: record.get('FormattedID'),
                y: pointSize,
                color: color,
                rallyName: record.get('Name'),
                status: (record.get('State') && record.get('State').Name) || '--No Entry--',
                blocked: blocked,
                blockedReason: blocked ? record.get('BlockedReason') : null,
                hasChildren: relatedCount > 0,
                relatedCount: relatedCount,
                ref: record.get('_ref'),
                parentFormattedID: null
            });
        },

        _colorFromStatus: function(state, blocked) { //refactor into css and classes, should get cleaner
            var progressColors = {
                'Defined': '#C0C0C0', // light gray
                'In-Progress': '#00A9E0', // cyan
                'Completed': '#8DC63F', // lime
                'Blocked': '#EE1C25' // red
            };
            var color =  progressColors[state];
            if (blocked) {
                color = progressColors.Blocked;
            }
            return color;
        },

        _addPointForChildItem: function(record, parentFormattedID, pointSize, parentState, isParentBlocked) {
            var blocked = record.get('Blocked');
            var state = record.get('ScheduleState');
            var color = this._colorFromStatus(this._storyStates[parentState || state], blocked || isParentBlocked);

            this._childChartData.push({
                name: record.get('FormattedID'),
                y: pointSize,
                color: color,
                rallyName: record.get('Name'),
                status: state,
                blocked: blocked,
                blockedReason: blocked ? record.get('BlockedReason') : null,
                hasChildren: false,
                relatedCount: 0,
                ref: record.get('_ref'),
                parentFormattedID: parentFormattedID
            });
        },

        _formatTooltip: function() {
            var relatedCount = '';
            var blockedMessage = '';
            var artifactName = this.point.rallyName ? '<b>' + this.point.name + '</b>: ' + this.point.rallyName + '<br/>' : this.point.name;

            if (this.point.blocked) {
                blockedMessage = '<b>Blocked</b>';
                if (this.point.blockedReason) {
                    blockedMessage += ': ' + this.point.blockedReason;
                }
            }

            if (this.point.series && this.point.series.name === 'Parents') {
                if(!this.point.userStory) {
                    var numRelated = this.point.relatedCount || 0;
                    relatedCount = 'Stories: ' + numRelated;
                }
                return artifactName + this.point.status + '<br/>' + relatedCount + '<br/>' + blockedMessage;
            } else {
                return artifactName + this.point.status + '<br/>' + blockedMessage;
            }
        }
    });
})();
