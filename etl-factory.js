"use strict";
var _ = require('underscore');
var s = require("underscore.string");
var walk = require('walk');
var indicatorHandlersDefinition = require('./etl-processors.js');
//Report Indicators Json Schema Path
var indicatorsSchemaDefinition = require('./reports/indicators.json');
var reportList = [];
//iterate the report folder picking  files satisfying  regex *report.json
reportList.push.apply(reportList, require('./reports/hiv-summary-report.json'));
reportList.push.apply(reportList, require('./reports/moh-731-report-v2.json'));
reportList.push.apply(reportList, require('./reports/patient-register-report.json'));
reportList.push.apply(reportList, require('./reports/clinic-calander-report-v2.json'));
reportList.push.apply(reportList, require('./reports/daily-visits-appointment.report.json'));


//etl-factory builds and generates queries dynamically in a generic way using indicator-schema and report-schema json files
module.exports = function () {
    var reports;
    var indicatorsSchema;
    var indicatorHandlers;
    initialize(reportList, indicatorsSchemaDefinition, indicatorHandlersDefinition);
    return {
        buildPatientListExpression: buildPatientListExpression,
        buildIndicatorsSchema: buildIndicatorsSchema,
        buildIndicatorsSchemaWithSections: buildIndicatorsSchemaWithSections,
        singleReportToSql: singleReportToSql,
        resolveIndicators: resolveIndicators,
        getReportList: getReportList,
        setReportList: setReportList,
        getIndicatorsSchema: getIndicatorsSchema,
        setIndicatorsSchema: setIndicatorsSchema,
        getIndicatorHandlers: getIndicatorHandlers,
        setIndicatorHandlers: setIndicatorHandlers
    };
    function getReportList() {
        return reports;
    }

    function setReportList(_reports) {
        reports = _reports;
    }

    function getIndicatorsSchema() {
        return indicatorsSchema;
    }

    function setIndicatorsSchema(_indicatorsSchema) {
        indicatorsSchema = _indicatorsSchema;
    }

    function getIndicatorHandlers() {
        return indicatorHandlers;
    }

    function setIndicatorHandlers(_indicatorHandlers) {
        indicatorHandlers = _indicatorHandlers;
    }

    function initialize(_reports, _indicatorsSchema, _indicatorHandlers) {
        setReportList(_reports);
        setIndicatorsSchema(_indicatorsSchema);
        setIndicatorHandlers(_indicatorHandlers);
    }

    function resolveIndicators(reportName, result) {
        _.each(reports, function (report) {
            if (report.name === reportName) {
                _.each(report.indicatorHandlers, function (handler) {
                    indicatorHandlers[handler.processor](handler.indicators, result);
                });

            }
        });
        return result;
    }

    function buildPatientListExpression(queryParams, successCallback) {
        //Check for undefined params
        if (queryParams === null || queryParams === undefined) return "";
        //Initialize returned obj
        var result = {
            whereClause: '',
            resource: ''
        };
        var whereClause = '';
        //create WhereClause
        _.each(indicatorsSchema, function (indicator) {
            _.each(queryParams.reportIndicator.split(','), function (indicatorName) {
                if (indicator.name === indicatorName) {
                    if (indicator.expression != '') {
                        whereClause += '(' + indicator.expression + ') or ';
                    }
                }
            });
        });
        var lastIndex = whereClause.lastIndexOf(' or ');
        whereClause = whereClause.substring(0, lastIndex);
        if (whereClause !== '') result.whereClause = ' and ' + whereClause;
        //identify resource/table
        _.each(reports, function (report) {
            if (report.name === queryParams.reportName) {
                result.resource = report.table['schema'] + '.' + report.table['tableName'];
            }
        });
        successCallback(result);
    }

    function buildIndicatorsSchema(queryParams, successCallback) {
        //Check for undefined params
        if (queryParams === null || queryParams === undefined) return "";
        var result = [];
        //Load json schema into the query builder
        _.each(reports, function (report) {
            if (report.name === queryParams.reportName) {
                _.each(report.indicators, function (reportIndicator) {
                    _.each(indicatorsSchema, function (indicator) {
                        if (indicator.name === reportIndicator.expression) {
                            result.push(indicator);
                        }
                    });
                });
            }
        });
        successCallback(result);
    }

    /**
     Returns the report json schema,resolved from  request parameter reportName
     **/
    function buildIndicatorsSchemaWithSections(queryParams, successCallback) {
        //Check for undefined params
        var allReportSections;
        if (queryParams === null || queryParams === undefined) return "";
        var result = [];
        //Load json schema into the query builder
        _.each(reports, function (report) {
            if (report.name === queryParams.reportName) {
                allReportSections = report.sections;
                _.each(report.indicators, function (reportIndicator) {
                    _.each(indicatorsSchema, function (indicator) {
                        if (indicator.name === reportIndicator.expression) {
                            //add section infor
                            try {
                                if (reportIndicator.section !== undefined) {
                                    var res = {
                                        section_key: reportIndicator.section,
                                        indicator_key: indicator
                                    };
                                } else {

                                    var res = {
                                        section_key: "",
                                        indicator_key: indicator
                                    };
                                }
                                result.push(res);

                            } catch (e) {
                                result.push(indicator);
                            }
                        }
                    });
                });
            }
        });
        successCallback([result, allReportSections]);
    }

    function singleReportToSql(requestParams, reportName) {
        if (requestParams === null || requestParams === undefined) return "";
        var queryPartsArray = [];
        if (reportName) {
            reportName = reportName;
        } else {
            reportName = requestParams.reportName;
        }
        _.each(reports, function (report) {
            if (report.name === reportName) {
                var nestedParts = '';
                if (report.table.hasNested && report.table.hasNested !== reportName) {
                    nestedParts = singleReportToSql(requestParams, report.table.hasNested);

                }
                var queryParts = {
                    columns: indicatorsToColumns(report, requestParams.countBy, requestParams),
                    concatColumns: concatColumnsToColumns(report),
                    table: report.table['schema'] + '.' + report.table['tableName'],
                    alias: report.table['alias'],
                    nestedParts: nestedParts,
                    joins: joinsToSql(report.joins, requestParams),
                    where: filtersToSql(requestParams.whereParams, report.parameters, report.filters),
                    group: groupClauseToSql(report.groupClause, requestParams.groupBy, report.parameters),
                    order: requestParams.order,
                    offset: requestParams.offset,
                    limit: requestParams.limit
                };

                queryPartsArray.push(queryParts);
            }
        });
        return queryPartsArray;
    }

function replaceIndicatorParam(_indicatorExpression, requestParam) {
  var indicatorExpression = _indicatorExpression;
  var result;
  console.log('underscore string', s.include(indicatorExpression,'endDate'));
  if (s.include(indicatorExpression,'endDate')) {
    if(requestParam.whereParams) {
      var dateParam = _.find(requestParam.whereParams, function(param){
        if(param.name === 'endDate') return param;
      });

      if (dateParam) {
        indicatorExpression =  s.replaceAll(indicatorExpression,'endDate', "'"+ dateParam.value + "'");
        console.log('end date param', indicatorExpression);
      }
    }

  }

  if (s.include(indicatorExpression,'startDate')) {
    if(requestParam.whereParams) {
      var dateParam = _.find(requestParam.whereParams, function(param){
        if(param.name === 'startDate') return param;
      });

      if (dateParam) {
        indicatorExpression = s.replaceAll(indicatorExpression,'startDate', "'"+ dateParam.value + "'");
        console.log('start date param', indicatorExpression);
      }
    }
  }

  return indicatorExpression;
}
    //converts a set of indicators into sql columns
    function indicatorsToColumns(report, countBy, requestParam) {
      console.log('request parameters', requestParam);
        var result = [];
        //converts a set of supplementColumns  into sql columns
        _.each(supplementColumnsToColumns(report), function (column) {
            result.push(column);
        });
        //converts set of indicators to sql columns
        _.each(report.indicators, function (singleIndicator) {
            _.each(indicatorsSchema, function (indicator) {
                if (requestParam.requestIndicators) {
                    //compare request params indicator list corresponds to the singleIndicator
                    _.each(requestParam.requestIndicators.split(','), function (requestIndicatorName) {
                        if (indicator.name === requestIndicatorName) {
                            if (indicator.name === singleIndicator.expression) {
                                //Determine indicator type, whether it is derived or an independent indicator
                                if (singleIndicator.sql.match(/\[(.*?)\]/)) {
                                    result.push(processesDerivedIndicator(report, singleIndicator, indicator));
                                } else {
                                    var column = singleIndicator.sql + ' as ' + singleIndicator.label;
                                    //check if indicator expression has endDate and startDate parameters
                                    var indicatorExpression = replaceIndicatorParam(indicator.expression, requestParam);
                                    column = column.replace('$expression', indicatorExpression);
                                    result.push(column);
                                }
                            }
                        }
                    });
                } else {
                    if (indicator.name === singleIndicator.expression) {
                        //Determine indicator type, whether it is derived or an independent indicator
                        if (singleIndicator.sql.match(/\[(.*?)\]/)) {
                            result.push(processesDerivedIndicator(report, singleIndicator, indicator, requestParam));
                        } else {
                            var column = singleIndicator.sql + ' as ' + indicator.name;
                            //check if indicator expression has endDate and startDate parameters
                            var indicatorExpression = replaceIndicatorParam(indicator.expression, requestParam);
                            column = column.replace('$expression', indicatorExpression);
                            result.push(column);
                        }
                    }
                }
            });
        });
        return result;

    }

    //converts set of derived indicators to sql columns
    function processesDerivedIndicator(report, derivedIndicator, indicator, requestParam) {
        var reg = /[\[\]']/g; //regex [] indicator
        var matches = [];
        derivedIndicator.sql.replace(/\[(.*?)\]/g, function (g0, g1) {
            matches.push(g1);
        });
        derivedIndicator.sql = derivedIndicator.sql.replace(reg, '');
        _.each(matches, function (indicatorKey) {
            _.each(report.indicators, function (singleIndicator) {
                if (indicatorKey === singleIndicator.expression) {
                    _.each(indicatorsSchema, function (indicator) {
                        if (indicator.name === indicatorKey) {
                            var column = singleIndicator.sql;
                            console.log('Derived Indicator request param', requestParam);
                            var indicatorExpression = replaceIndicatorParam(indicator.expression, requestParam);
                            column = column.replace('$expression', indicatorExpression);
                            derivedIndicator.sql = derivedIndicator.sql.replace(indicatorKey, column);
                        }
                    });
                }
            });
        });
        console.log('track derived indicator', derivedIndicator.sql);
        return derivedIndicator.sql + ' as ' + indicator.name;
    }

    //converts a set of supplement columns of type single into sql columns
    function supplementColumnsToColumns(report) {
        var result = [];
        _.each(report.supplementColumns, function (supplementColumn) {
            if (supplementColumn.type === 'single') {
                var column = supplementColumn.sql + ' as ' + supplementColumn.label;
                result.push(column);
            } else if (supplementColumn.type === 'all') {
                var column = supplementColumn.sql
                result.push(column);
            }
        });
        return result;
    }

    //converts a set of supplement columns of type multiple into sql columns
    function concatColumnsToColumns(report) {
        var result = '';
        _.each(report.supplementColumns, function (supplementColumn) {
            if (supplementColumn.type === 'multiple') {
                var column = supplementColumn.sql + ' as ' + supplementColumn.label;
                result += column;
                result += ', ';
            }
        });
        var lastIndex = result.lastIndexOf(',');
        result = result.substring(0, lastIndex);
        return result;
    }

    //converts an array of tables into sql
    function joinsToSql(joins, requestParams) {
        var result = [];
        _.each(joins, function (join) {
            if (join.tableName) {
                var r = [join['schema'] + '.' + join['tableName'], join['alias'], join['joinExpression'], join['joinType']];
                var joinOject = {
                    schema: join.schema,
                    tableName: join.tableName,
                    alias: join.alias,
                    joinExpression: join.joinExpression,
                    joinType: join.joinType
                }
                result.push(joinOject);
            } else {
                var queryParts = singleReportToSql(requestParams, join.joinedReport)
                var joinOject = {
                    schema: join.schema,
                    tableName: join.tableName,
                    alias: join.alias,
                    joinExpression: join.joinExpression,
                    joinType: join.joinType,
                    joinedQuerParts: queryParts
                };
                console.log('testing joinedReport', joinOject);
                result.push(joinOject);
                //var r = [join['schema'] + '.' + join['tableName'], join['alias'], join['joinExpression'], join['joinType']];
            }
        });
        return result;
    }

    //converts an array of group clause into squel consumable
    function groupClauseToSql(groupClauses, groupBy, reportParams) {
        var result = [];
        _.each(groupBy.split(','), function (by) {
            _.each(groupClauses, function (groupClause) {
                if (groupClause["parameter"] === by) {
                    _.each(reportParams, function (reportParam) {
                        if (reportParam["name"] === groupClause["parameter"]) {
                            _.each(reportParam["defaultValue"], function (value) {
                                result.push(value["expression"]);
                            });
                        }
                    });
                }
            });
        });
        return result;
    }

    function _getMatchingWhereExpression(whereParams, reportFilter) {

      var matchingWhereExpression = _.find(whereParams, function(whereParam){
        if ((whereParam["name"] === reportFilter["parameter"] &&
        whereParam["value"])|| reportFilter["processForce"] === true) {
          console.log('final Method report--->', whereParam);
          return whereParam;
        }

      });
      return matchingWhereExpression;
    }
    //converts an array of filters into sql
    function filtersToSql(whereParams, reportParams, reportFilters) {
        var result = [];
        var expression = '';
        var parameters = [];
        console.log('Report/Json Params', reportParams);
        console.log('Report/Filters', reportFilters);
        console.log('Web/Client Params', whereParams);
        _.each(reportFilters, function (reportFilter) {

          // console.log('final report--->', reportFilter);
          //search in the web/Client params to see if there is a matching Param
          //Process an array of Parameters in the report filters
          var reportFilterParam = reportFilter["parameter"];
          var reportFilterParamArray = [];
          if(s.include(reportFilterParam,',')) {
            reportFilterParamArray = reportFilterParam.split(',');
          }
          var matchingWhereExpression;

          if(reportFilterParamArray.length > 1) {

            for(var i in reportFilterParamArray) {
              var dummyReportFilter = {
                parameter: reportFilterParamArray[i],
                processForce:reportFilter["processForce"]
              };
              matchingWhereExpression = _getMatchingWhereExpression(whereParams, dummyReportFilter);
              if(!_.isUndefined(matchingWhereExpression) && i === '0') {
                expression += reportFilter["expression"];
                expression += ' and ';
              }
              if(!_.isUndefined(matchingWhereExpression)) {
                var matchingReportParam = _.find(reportParams, function(reportParam){
                  if (reportParam["name"] === matchingWhereExpression["name"])
                  return reportParam;
                });

                if(!_.isUndefined(matchingReportParam) && reportFilter["processForce"] !==true) {
                  parameters.push(matchingWhereExpression["value"]);
                }
              }
            }

          } else {
            matchingWhereExpression = _getMatchingWhereExpression(whereParams, reportFilter);
            if(!_.isUndefined(matchingWhereExpression)) {
              expression += reportFilter["expression"];
              expression += ' and ';

              var matchingReportParam = _.find(reportParams, function(reportParam){
                if (reportParam["name"] === matchingWhereExpression["name"])
                return reportParam;
              });
              console.log('final params-report', matchingReportParam);
              console.log('final params-where', matchingWhereExpression);
              if(!_.isUndefined(matchingReportParam) && reportFilter["processForce"] !==true ) {
                parameters.push(matchingWhereExpression["value"]);
              }
            }

          }
          // matchingWhereExpression = _.find(whereParams, function(whereParam){
          //   if (whereParam["name"] === reportFilter["parameter"] &&
          //   whereParam["value"] || reportFilter["processForce"] === true)
          //   return whereParam;
          // });


            // _.each(whereParams, function (whereParam) {
            //     //checks whether param value is set, if not set the filter is not pushed.
            //     //also checks if report filter parameter passed is eq to where param
            //     if (whereParam["name"] === reportFilter["parameter"] && whereParam["value"] || reportFilter["processForce"] === true) {
            //         expression += reportFilter["expression"];
            //         expression += ' and ';
            //         _.each(reportParams, function (reportParam) {
            //             if (reportParam["name"] === whereParam["name"]) {
            //                 parameters.push(whereParam["value"]);
            //             }
            //         });
            //     }
            // });
        });
        var lastIndex = expression.lastIndexOf('and');
        expression = expression.substring(0, lastIndex);
        result.push(expression);
        console.log('final results', result);
        console.log('final paras', parameters);
        result.push.apply(result, parameters);

        return result;
    }

}();
