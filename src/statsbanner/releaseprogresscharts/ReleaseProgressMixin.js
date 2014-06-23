(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.releasetracking.statsbanner.iterationprogresscharts.IterationProgressMixin", {
        requires: [
            "Rally.ui.chart.Chart"
        ],

        _configureYAxis: function(ticks, axis) {

            var intervalY = (this.chartComponentConfig.chartConfig.yAxis[axis].max - 0) / (ticks - 1);
            var ticksY = [];
            for (var i = 0; i < ticks; i++) {
                ticksY.push(i * intervalY);
            }
            this.chartComponentConfig.chartConfig.yAxis[axis].tickPositions = ticksY;
        },

        _configureYAxisIntervals: function () {
            var ticks = 5; // not much chart space, limit to 5
            this._configureYAxis(ticks, 0);
            if(this.chartType === "burndown") { // cumulative flow only has y axis 0
                this._configureYAxis(ticks, 1);
            }
        },

        _getElementValue: function (element) {
            if (element.textContent !== undefined) {
                return element.textContent;
            }
            return element.text;
        },
        
        _getStringValues: function (elements) {
            var i;
            var strings = [];
            for (i = 0; i < elements.length; i++) {
                strings.push(this._getElementValue(elements[i]));
            }
            return strings;
        },

        _getNumberValues: function (elements) {
            var i;
            var numbers = [];
            for (i = 0; i < elements.length; i++) {
                if(this._getElementValue(elements[i])) {
                    numbers.push(this._getElementValue(elements[i]).split(' ')[0] * 1);
                } else {
                    numbers.push(0);
                }

            }
            return numbers;
        },

        _computeMaxYAxisValue: function(series) {
            var i, j, max = 0.0;
            // sum each day's values and find the largest sum
            for(i=0; i < series[0].data.length; i++) {
                var val = 0.0;
                for(j=0; j < series.length; j++) {
                    // if is for insurance, _should_ always be true
                    if(series[j].data.length === series[0].data.length) {
                        val += series[j].data[i];
                    }
                }
                if(val > max) {
                    max = val;
                }
            }
            max = Math.ceil(max / 4) * 4;  // round up to multiple of 4 so we will create 5 integral tick marks

            return (max === 0) ? 4 : max;
        },

        _createChartDatafromXML: function (xml) {
            var parseXml;

            if (typeof window.DOMParser !== "undefined") {
                parseXml = function (xmlStr) {
                    return ( new window.DOMParser() ).parseFromString(xmlStr, "text/xml");
                };
            } else if (typeof window.ActiveXObject !== "undefined" &&
                new window.ActiveXObject("Microsoft.XMLDOM")) {
                parseXml = function (xmlStr) {
                    var xmlDoc = new window.ActiveXObject("Microsoft.XMLDOM");
                    xmlDoc.async = "false";
                    xmlDoc.loadXML(xmlStr);
                    return xmlDoc;
                };
            } else {
                throw new Error("No XML parser found");
            }

            return parseXml(xml);
        }
    });
}());
