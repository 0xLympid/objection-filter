"use strict";
/**
 * A wrapper around the objection.js model class
 * For 'where' you cannot have combinations of properties in a single AND condition
 * e.g.
 * {
 *   and: {
 *     'a.b.c': 1,
 *     'b.e': 2
 *   },
 *   or: [
 *      {}
 *   ]
 * }
 *
 * However, for 'require' conditions, this might be possible since ALL variables exist
 * in the same scope, since there's a join
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyRequire = applyRequire;
exports.applyOrder = applyOrder;
exports.applyFields = applyFields;
exports.applyLimit = applyLimit;
const lodash_1 = __importDefault(require("lodash"));
const objection_1 = require("objection");
const ExpressionBuilder_1 = require("./ExpressionBuilder");
const LogicalIterator_1 = require("./LogicalIterator");
const utils_1 = require("./utils");
class FilterQueryBuilder {
    /**
     * @param {Model} Model
     * @param {Transaction} trx
     * @param {Object} options.operators Custom operator handlers
     */
    constructor(Model, trx, options = {}) {
        this.defaultPageLimit = 100;
        const { operators = {}, onAggBuild, builder, defaultPageLimit } = options;
        this.Model = Model;
        this._builder = builder || Model.query(trx);
        if (defaultPageLimit) {
            this.defaultPageLimit = defaultPageLimit;
        }
        // Initialize instance specific utilities
        this.utils = (0, utils_1.Operations)({ operators, onAggBuild });
    }
    build(params = {}) {
        const { fields, limit, offset, order, where, aggregations } = params;
        applyRequire(params.require, this._builder, this.utils);
        applyOrder(order, this._builder);
        where &&
            applyRequire(Object.assign({}, where), this._builder, this.utils);
        aggregations && applyAggregations(aggregations, this._builder, this.utils);
        applyLimit(limit, offset, this._builder, this.defaultPageLimit);
        applyFields(fields, this._builder);
        return this._builder;
    }
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            const { count } = (yield this._builder
                .clone()
                .clear(/orderBy|offset|limit/)
                .clearWithGraph()
                .count('* AS count')
                .first());
            return count;
        });
    }
}
exports.default = FilterQueryBuilder;
/**
 * Based on a relation string, get the outer most model
 * @param {QueryBuilder} builder
 * @param {String} relation
 */
const getOuterModel = function (builder, relation) {
    const Model = builder.modelClass();
    let CurrentModel = Model;
    for (const relationName of relation.split('.')) {
        const currentRelation = CurrentModel.getRelations()[relationName];
        CurrentModel = currentRelation.relatedModelClass;
    }
    return CurrentModel;
};
/**
 * Return a case statement which fills nulls with zeroes
 * @param {String} alias
 */
const nullToZero = function (tableAlias, columnAlias = 'count') {
    const column = `${tableAlias}.${columnAlias}`;
    return (0, objection_1.raw)('case when ?? is null then 0 else cast(?? as decimal) end as ??', [
        column,
        column,
        columnAlias,
    ]);
};
// A list of allowed aggregation functions
const aggregationFunctions = ['count', 'sum', 'min', 'max', 'avg'];
/**
 * Build a single aggregation into a target alias on a query builder
 * Defaults to count, but anything in aggregationFunctions can be used
 * @param {Object} aggregation
 * @param {QueryBuilder} builder
 * @param {Object} utils
 */
const buildAggregation = function (aggregation, builder, utils) {
    const Model = builder.modelClass();
    const knex = Model.knex();
    const { relation, where, distinct = false, alias: columnAlias = 'count', type = 'count', field, } = aggregation;
    const { onAggBuild } = utils;
    // Do some initial validation
    if (!aggregationFunctions.includes(type)) {
        throw new Error(`Invalid type [${type}] for aggregation`);
    }
    if (type !== 'count' && !field) {
        throw new Error(`Must specify "field" with [${type}] aggregation`);
    }
    const baseIdColumn = typeof Model.idColumn === 'string'
        ? [Model.tableName + '.' + Model.idColumn]
        : Model.idColumn.map((idColumn) => Model.tableName + '.' + idColumn);
    // When joining the filter query, the base left-joined table is aliased
    // as the full relation name joined by the : character
    const relationNames = relation === null || relation === void 0 ? void 0 : relation.split('.');
    const fullOuterRelation = relationNames.join(':');
    // Filtering starts using the outermost model as a base
    const OuterModel = getOuterModel(builder, relation);
    const idColumns = lodash_1.default.isArray(OuterModel.idColumn)
        ? OuterModel.idColumn
        : [OuterModel.idColumn];
    const fullIdColumns = typeof idColumns === 'object'
        ? idColumns.map((idColumn) => `${fullOuterRelation}.${idColumn}`)
        : undefined;
    // Create the subquery for the aggregation with the base model as a starting point
    const distinctTag = distinct ? 'distinct ' : '';
    const aggregationQuery = Model.query()
        .select(baseIdColumn)
        .select(knex.raw(`${type}(${distinctTag}??) as ??`, [
        field
            ? `${fullOuterRelation}.${field}`
            : fullIdColumns
                ? fullIdColumns[0]
                : null,
        columnAlias,
    ]))
        .leftJoinRelated(relation)
        .context(builder.context());
    // Apply filters to models on the aggregation path
    if (onAggBuild && typeof relation === 'string') {
        let CurrentModel = Model;
        const relationStack = [];
        for (const relationName of relation.split('.')) {
            relationStack.push(relationName);
            const { relatedModelClass } = CurrentModel.getRelations()[relationName];
            const query = onAggBuild(relatedModelClass);
            const fullyQualifiedRelation = relationStack.join(':');
            if (query) {
                const aggModelAlias = `${fullyQualifiedRelation}_agg`;
                aggregationQuery.innerJoin(query.as(aggModelAlias), function () {
                    this.on(`${aggModelAlias}.${relatedModelClass.idColumn}`, '=', `${fullyQualifiedRelation}.${relatedModelClass.idColumn}`);
                });
            }
            CurrentModel = relatedModelClass;
        }
    }
    // Apply the filtering using the outer model as a starting point
    const filterQuery = OuterModel.query().context(builder.context());
    applyRequire(where, filterQuery, utils);
    const filterQueryAlias = 'filter_query';
    aggregationQuery.innerJoin(filterQuery.as(filterQueryAlias), function () {
        fullIdColumns === null || fullIdColumns === void 0 ? void 0 : fullIdColumns.forEach((fullIdColumn, index) => {
            this.on(fullIdColumn, '=', `${filterQueryAlias}.${idColumns[index]}`);
        });
    });
    aggregationQuery.groupBy(baseIdColumn);
    return aggregationQuery;
};
const applyAggregations = function (aggregations, builder, utils) {
    if (aggregations.length === 0) {
        return;
    }
    const Model = builder.modelClass();
    const aggAlias = (i) => `agg_${i}`;
    const idColumns = lodash_1.default.isArray(Model.idColumn)
        ? Model.idColumn
        : [Model.idColumn];
    const fullIdColumns = typeof idColumns === 'object'
        ? idColumns.map((id) => `${Model.tableName}.${id}`)
        : undefined;
    const aggregationQueries = aggregations.map((aggregation) => buildAggregation(aggregation, builder, utils));
    // Create a replicated subquery equivalent to the base model + aggregations
    const fullQuery = Model.query()
        .select(Model.tableName + '.*')
        .context(builder.context());
    // For each aggregation query, select the aggregation then join onto the full query
    aggregationQueries.forEach((query, i) => {
        const nullToZeroStatement = nullToZero(aggAlias(i), aggregations[i].alias);
        fullQuery
            .select(nullToZeroStatement)
            .leftJoin(query.as(aggAlias(i)), function () {
            fullIdColumns === null || fullIdColumns === void 0 ? void 0 : fullIdColumns.forEach((fullIdColumn, j) => {
                this.on(fullIdColumn, '=', `${aggAlias(i)}.${idColumns[j]}`);
            });
        });
    });
    // Finally, build the base query
    builder.from(fullQuery.as(Model.tableName));
};
/**
 * Test if a property is a related property
 * e.g. "name" => false, "movies.name" => true
 * @param {String} name
 */
const isRelatedProperty = function (name) {
    return !!(0, utils_1.sliceRelation)(name).relationName;
};
/**
 * Test all relations on a set of properties for a particular condition
 */
function testAllRelations(properties, Model, predicate) {
    let testResult = true;
    for (const field of properties) {
        const { relationName } = (0, utils_1.sliceRelation)(field);
        if (!relationName) {
            continue;
        }
        let rootModel = Model;
        for (const relatedModelName of relationName.split('.')) {
            const relation = rootModel.getRelation(relatedModelName);
            if (!predicate(relation)) {
                testResult = false;
                break;
            }
            rootModel = relation.relatedModelClass;
        }
    }
    return testResult;
}
/**
 * Apply an entire require expression to the query builder
 * e.g. { "prop1": { "like": "A" }, "prop2": { "in": [1] } }
 * Do a first pass on the fields to create an objectionjs RelationExpression
 * This prevents joining tables multiple times, and optimizes number of joins
 * @param {Object} filter
 * @param {QueryBuilder} builder The root query builder
 */
function applyRequire(filter = {}, builder, utils) {
    const { applyPropertyExpression } = utils;
    // If there are no properties at all, just return
    const propertiesSet = (0, LogicalIterator_1.getPropertiesFromExpression)(filter);
    if (propertiesSet.length === 0) {
        return builder;
    }
    const applyLogicalExpression = (0, LogicalIterator_1.iterateLogicalExpression)({
        onExit: function (propertyName, value, _builder) {
            applyPropertyExpression(propertyName, value, _builder);
        },
        onLiteral: function () {
            throw new Error('Filter is invalid');
        },
    });
    const getFullyQualifiedName = (name) => (0, utils_1.sliceRelation)(name, '.', Model.tableName).fullyQualifiedProperty;
    const Model = builder.modelClass();
    const idColumns = lodash_1.default.isArray(Model.idColumn)
        ? Model.idColumn
        : [Model.idColumn];
    const fullIdColumns = typeof idColumns === 'object'
        ? idColumns.map((idColumn) => `${Model.tableName}.${idColumn}`)
        : [];
    // If there are no related properties, don't join
    const relatedPropertiesSet = propertiesSet.filter(isRelatedProperty);
    if (relatedPropertiesSet.length === 0) {
        applyLogicalExpression(filter, builder, false, getFullyQualifiedName);
        return builder;
    }
    // If only joining belongsTo relationships, create a simpler query
    const isOnlyJoiningToBelongsTo = testAllRelations(propertiesSet, Model, (relation) => relation instanceof Model.BelongsToOneRelation ||
        relation instanceof Model.HasOneRelation);
    if (isOnlyJoiningToBelongsTo) {
        // If there are only belongsTo or hasOne relations, then filter on the main query
        applyLogicalExpression(filter, builder, false, getFullyQualifiedName);
        const joinRelation = (0, ExpressionBuilder_1.createRelationExpression)(propertiesSet);
        builder.leftJoinRelated(joinRelation);
        return builder.select(`${builder.modelClass().tableName}.*`);
    }
    // If there are a hasMany or manyToMany relations, then create a separate filter query
    const filterQuery = Model.query()
        .distinct(...fullIdColumns)
        .context(builder.context());
    applyLogicalExpression(filter, filterQuery, false, getFullyQualifiedName);
    // If there were related properties, join onto the filter
    const joinRelation = (0, ExpressionBuilder_1.createRelationExpression)(propertiesSet);
    filterQuery.leftJoinRelated(joinRelation);
    const filterQueryAlias = 'filter_query';
    builder.innerJoin(filterQuery.as(filterQueryAlias), function () {
        fullIdColumns.forEach((fullIdColumn, index) => {
            this.on(fullIdColumn, '=', `${filterQueryAlias}.${idColumns[index]}`);
        });
    });
    return builder;
}
/**
 * Order the result by a root model field or order related models
 * Related properties are ordered locally (within the subquery) and not globally
 * e.g. order = "name desc, city.country.name asc"
 * @param {String} order An comma delimited order expression
 * @param {QueryBuilder} builder The root query builder
 */
function applyOrder(order, builder) {
    if (!order) {
        return builder;
    }
    const Model = builder.modelClass();
    order.split(',').forEach((orderStatement) => {
        const [orderProperty, direction = 'asc'] = orderStatement
            .trim()
            .split(' ');
        const { propertyName, relationName } = (0, utils_1.sliceRelation)(orderProperty);
        // Use fieldExpressionRef to sort if necessary
        const orderBy = (queryBuilder, fullyQualifiedColumn) => {
            queryBuilder.orderBy(fullyQualifiedColumn, direction);
        };
        if (!relationName) {
            // Root level where should include the root table name
            const fullyQualifiedColumn = `${Model.tableName}.${propertyName}`;
            return orderBy(builder, fullyQualifiedColumn);
        }
        // For now, only allow sub-query ordering of ea expressions
        builder.modifyGraph(relationName, (eaBuilder) => {
            const fullyQualifiedColumn = `${eaBuilder.modelClass().tableName}.${propertyName}`;
            orderBy(eaBuilder, fullyQualifiedColumn);
        });
    });
    return builder;
}
/**
 * Based on a relation name, select a subset of fields. Do nothing if there are no fields
 * @param {Builder} builder An instance of a knex builder
 * @param {Array<String>} fields A list of fields to select
 */
function selectFields(fields, builder, relationName) {
    if (fields.length === 0) {
        return builder;
    }
    const knex = builder.modelClass().knex();
    // HACK: sqlite incorrect column alias when selecting 1 column
    // TODO: investigate sqlite column aliasing on ea models
    if (fields.length === 1 && !relationName) {
        const field = fields[0].split('.')[1];
        return builder.select(knex.raw('?? as ??', [fields[0], field]));
    }
    if (!relationName) {
        return builder.select(fields);
    }
    return builder.modifyGraph(relationName, (eaQueryBuilder) => {
        eaQueryBuilder.select(fields.map((field) => `${eaQueryBuilder.modelClass().tableName}.${field}`));
    });
}
/**
 * Select a limited set of fields. Use dot notation to limit ealy loaded models.
 * @param {Array<String>} fields An array of dot notation fields
 * @param {QueryBuilder} builder The root query builder
 */
function applyFields(fields = [], builder) {
    const Model = builder.modelClass();
    // Group fields by relation e.g. ["a.b.name", "a.b.id"] => {"a.b": ["name", "id"]}
    const rootFields = []; // Fields on the root model
    const fieldsByRelation = fields.reduce((obj, fieldName) => {
        const { propertyName, relationName } = (0, utils_1.sliceRelation)(fieldName);
        if (!relationName) {
            rootFields.push(`${Model.tableName}.${propertyName}`);
        }
        else {
            // Push it into an array keyed by relationName
            obj[relationName] = obj[relationName] || [];
            obj[relationName].push(propertyName);
        }
        return obj;
    }, {});
    // Root fields
    selectFields(rootFields, builder);
    // Related fields
    lodash_1.default.map(fieldsByRelation, (_fields, relationName) => selectFields(_fields, builder, relationName));
    return builder;
}
function applyLimit(limit, offset = 0, builder, defaultPageLimit) {
    limit = !limit || limit > defaultPageLimit ? defaultPageLimit : limit;
    builder.page(offset, limit);
    return builder;
}
//# sourceMappingURL=FilterQueryBuilder.js.map