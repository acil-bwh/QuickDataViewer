/**
 * Created by predout on 10/20/15.
 */

//==================================================================================================================
// Dashboard variables

var colorTable = d3.scale.category10();
var dataKeys, key1, key2, previous_key1, previous_key2;
var dataTypes = {};  //Stores the type of the data as one of 'numerical','categorical','freeform', 'nans'
var dimensions = {};
var groups = {};
var mainChart;
var minVals = {};
var maxVals = {};
var keysNotNanCounter = {};
var ndx;
var scatterDimension = 0;


//==================================================================================================================
// Functions related to the drop-down menues - should go to the html
function populateDropDownBoxesFields() {
    var drop1 = document.getElementById("dd1");
    var drop2 = document.getElementById("dd2");

    dataKeys.forEach(function (data) {
        var newOption1 = document.createElement("option");
        newOption1.value = data;
        newOption1.innerHTML = data;
        var newOption2 = document.createElement("option");
        newOption2.value = data;
        newOption2.innerHTML = data;
        drop1.options.add(newOption1);
        drop2.options.add(newOption2);
    });
    drop1.selectedIndex = 0;
    drop2.selectedIndex = 1;
}

function updateMainDisplayDimensionsFromDropDownFields() {
    var drop1 = document.getElementById("dd1");
    var key1 = drop1.options[drop1.selectedIndex].value;
    var drop2 = document.getElementById("dd2");
    var key2 = drop2.options[drop2.selectedIndex].value;
    console.log("Key 1:", key1);
    console.log("Key 2:", key2);
    setMainPlotDimensions(key1, key2);
}


//==================================================================================================================
// Extra functions for statistical computations

function mypluck(array, property) {
    var i, rv = [];
    for (i = 0; i < array.length; ++i) {
        rv[i] = array[i][property];
    }
    return rv;
}


function computeCorrelation() {
    var drop1 = document.getElementById("dd1");
    var drop2 = document.getElementById("dd2");
    var key1 = drop1.options[drop1.selectedIndex].value;
    var key2 = drop2.options[drop2.selectedIndex].value;
    var data = dimensions[key1].top(Infinity);
    var x_corr = mypluck(data, key1);
    var y_corr = mypluck(data, key2);
    var corr_coeff = jStat.corrcoeff(x_corr, y_corr);
    var r2 = corr_coeff * corr_coeff;
    var spearman = jStat.spearmancoeff(x_corr,y_corr);
    var sr2 = spearman*spearman;
    d3.select("#title-chart-main").text("scatter R^2= " + r2.toFixed(4) + " spearman's R^2= " + sr2.toFixed(4))
}


//==================================================================================================================
// Internal functions for configuration of the dashboard

function setMainPlotDimensions(key1, key2) {

    // Hack for the scatter dimension initialization - no time to do it better
    if (typeof(scatterDimension) == 'object') {
        scatterDimension.dispose();
    }


    if (dataTypes[key1] == 'numerical') {

        scatterDimension = ndx.dimension(function (d) {
            return [d[key1], d[key2]];
        });

        var scatterGroup = scatterDimension.group().reduceSum(function (d) {
            return d[key1];
        });

        mainChart = dc.scatterPlot("#chart-main");

        mainChart
            .width(900)
            .height(480)
            .brushOn(false)
            .symbolSize(5)
            .clipPadding(10)
            .transitionDuration(0)
            .on("postRedraw", computeCorrelation);

        mainChart.x(d3.scale.linear().domain([minVals[key1], maxVals[key1]]))
            .y(d3.scale.linear().domain([minVals[key2], maxVals[key2]]))
            .yAxisLabel(key2)
            .xAxisLabel(key1)
            .dimension(scatterDimension)
            .group(scatterGroup);
        dc.renderAll();
        computeCorrelation();
    }

    if (dataTypes[key1] == 'categorical') {

        scatterDimension = ndx.dimension(function (d) {
            return d[key2];
        });
       scatterGroup     = scatterDimension.group().reduce(
        function(p,v) {
          p.push(v[key2]);
          return p;
        },
        function(p,v) {
          p.splice(p.indexOf(v[key2]), 1);
          return p;
        },
        function() {
          return [];
        }
      );

        mainChart = dc.boxPlot("#chart-main");

        mainChart
            .width(900)
            .height(480)
            .clipPadding(10)
            .transitionDuration(0)

        mainChart.dimension(scatterDimension)
            .group(scatterGroup);
        dc.renderAll();
    }

}

// Functions for the chart
function generateCategoricalRowChart(key, dimension, group) {
    var chartGen = dc.rowChart("#chart-" + key)
    var nEls = group.all().length
    chartGen.width(400).height(nEls * 25 + 35)
        .dimension(dimension)
        .group(group)
        .elasticX(true)
        .colors(function (d) {
            return colorTable(d);
        })
    return chartGen;
}

function generateHistogram(key, dimension, group, minVal, maxVal) {
    var chartGen = dc.barChart("#chart-" + key)
    chartGen.width(400).height(150)
        .dimension(dimension)
        .group(group)
        .x(d3.scale.linear().domain([minVal, maxVal]))
        .elasticY(true)
        .xUnits(function () {
            return 20;
        })
        .gap(10)
    return chartGen;
}


function turnCSVURLIntoDashboard(url) {
    d3.csv(url, function (error, data) {
        console.log(data)
        generateDashboard(data);
    });
}


function turnCSVDataIntoDashboard(csvRawData) {
    data = d3.csv.parse(csvRawData);
    generateDashboard(data);
}


function addDivToDashboard(key) {
    var d = document.getElementById("charts");
    var chartid = "chart-" + key;
    d.innerHTML +=
        '<div id="chart-' + key + '">' +
        '<div class="title" id="title-chart-' + key + '">' + key +
        '</div>' +
        '</div>';
}


// Main function
function generateDashboard(data) {

    dataKeys = Object.keys(data[0]);

    // Adds the divs to the document, one per key of the objects except db_cid and db_sid
    addDivToDashboard("main");
    dataKeys.forEach(function (key) {
        addDivToDashboard(key);
    });


    // Variables to store min and max values, as well as number of cases where the data is numeric
    dataKeys.forEach(function (key) {
        minVals[key] = 1000000;
        maxVals[key] = -1000000;
        keysNotNanCounter[key] = 0;
    });

    // A little bit of data coertion, min/max computation and test for numerical / categorical
    data.forEach(function (x) {
        dataKeys.forEach(function (key) {
            // Hack to remove , from the strings containing numbers
            // what would happen with european numbers? i.e. . for separations and , for decimals
            x[key] = x[key].replace(",", "");
            if (!isNaN(x[key])) {
                x[key] = +x[key];
                if (x[key] > maxVals[key]) maxVals[key] = x[key];
                if (x[key] < minVals[key]) minVals[key] = x[key];
                keysNotNanCounter[key] += 1;
            }
        })
    });

    populateDropDownBoxesFields();


    // set crossfilter
    ndx = crossfilter(data)

    // Generates the dimensions, groups and charts
    //TODO: actually those variables are not needed to be global, they are useful for debug purposes
    dataKeys.forEach(function (key) {

        // We are not interested in such displaying cid or sid
        dimensions[key] = ndx.dimension(function (d) {
            return d[key];
        })

        // If most of the values of the key are numeric ...
        if (keysNotNanCounter[key] == data.length) {
            // Gets the number of elements per dimension
            var nElements = dimensions[key].group().all().length
            if (nElements < 10) { //Numerical value but referring to categorical numbers
                groups[key] = dimensions[key].group().reduceCount();
                chart = generateCategoricalRowChart(key, dimensions[key], groups[key]);
                dataTypes[key] = 'categorical';
            }
            else { //Numerical value
                //TODO: set the number of steps as a parameter
                var divC = (maxVals[key] - minVals[key]) / 30;
                groups[key] = dimensions[key].group(function (d) {
                    return Math.floor(d / divC) * divC;
                })
                generateHistogram(key, dimensions[key], groups[key], minVals[key], maxVals[key])
                dataTypes[key] = 'numerical';
            }
        } else { //Categorical value
            // TODO: check for Nans
            groups[key] = dimensions[key].group()
            var nElements = dimensions[key].group().all().length
            if (nElements < 25) {
                chart = generateCategoricalRowChart(key, dimensions[key], groups[key])
                dataTypes[key] = 'categorical';
            } else {
                document.getElementById('chart-'+key).style.display = 'none'
                dataTypes[key] = 'freeform';
            }
        }
    })

    key1 = dataKeys[1]
    key2 = dataKeys[2]
    previous_key1 = key1
    previous_key2 = key2


    setMainPlotDimensions(key1, key2);

    computeCorrelation();

    dc.renderAll();

}
