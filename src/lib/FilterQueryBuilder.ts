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

import { Knex } from 'knex';
import _ from 'lodash';
import {
  QueryBuilder,
  Transaction,
  ModelClass,
  Model as ObjModel,
  OrderByDirection,
  Relation,
  raw,
  RawBuilder,
} from 'objection';

import { createRelationExpression } from './ExpressionBuilder';
import {
  iterateLogicalExpression,
  getPropertiesFromExpression,
} from './LogicalIterator';
// Types
import {
  FilterQueryBuilderOptions,
  OperationUtils,
  FilterExpression,
  BaseModel,
  AggregationConfig,
  RequireExpression,
  ExpressionObject,
  Expression,
} from './types';
import {
  sliceRelation,
  Operations,
  isFieldExpression,
  getFieldExpressionRef,
} from './utils';

export default class FilterQueryBuilder<
  M extends BaseModel,
  K extends typeof ObjModel,
> {
  Model: K;

  _builder: QueryBuilder<M>;

  utils: OperationUtils<M>;

  defaultPageLimit = 100;

  /**
   * @param {Model} Model
   * @param {Transaction} trx
   * @param {Object} options.operators Custom operator handlers
   */
  constructor(
    Model: K,
    trx?: Transaction,
    options: FilterQueryBuilderOptions<M> = {},
  ) {
    const { operators = {}, onAggBuild, builder, defaultPageLimit } = options;

    this.Model = Model;
    this._builder = builder || (Model.query(trx) as unknown as QueryBuilder<M>);

    if (defaultPageLimit) {
      this.defaultPageLimit = defaultPageLimit;
    }

    // Initialize instance specific utilities
    this.utils = Operations({ operators, onAggBuild });
  }

  basicBuild(params: FilterExpression = {}): QueryBuilder<M> {
    const { fields, order, where, aggregations, include } = params;
    applyRequire(params.require, this._builder, this.utils);

    applyOrder(order, this._builder);
    where &&
      applyRequire(
        Object.assign({}, where) as ExpressionObject,
        this._builder,
        this.utils,
      );
    aggregations && applyAggregations(aggregations, this._builder, this.utils);
    aggregations &&
      applyAggregationsCurrentModel(aggregations, this._builder, this.utils);

    applyInclude(include, this._builder);

    applyFields(fields, this._builder);
    return this._builder;
  }

  build(params: FilterExpression = {}): QueryBuilder<M> {
    this.basicBuild(params);
    const { limit, offset } = params;
    applyLimit(limit, offset, this._builder, this.defaultPageLimit);

    return this._builder;
  }

  paginated(params: FilterExpression = {}): QueryBuilder<M> {
    this.basicBuild(params);
    const { limit, offset } = params;
    applyPage(limit, offset, this._builder, this.defaultPageLimit);

    return this._builder;
  }

  first(params: FilterExpression = {}): QueryBuilder<M, M | undefined> {
    return this.basicBuild(params).first();
  }

  async count(): Promise<number> {
    const { count } = (await this._builder
      .clone()
      .clear(/orderBy|offset|limit/)
      .clearWithGraph()
      .count('* AS count')
      .first()) as { count: number };

    return count;
  }
}

const extractWhereClause = function <M extends BaseModel>(
  queryBuilder: QueryBuilder<M>,
  knex: Knex,
): string {
  const sqlObject = queryBuilder.toKnexQuery().toSQL();
  const rawSQL = sqlObject.sql;
  const bindings = sqlObject.bindings;

  const whereStartIndex = rawSQL.toLowerCase().indexOf('where');
  if (whereStartIndex === -1) {
    return ''; // No WHERE clause present
  }

  const whereClause = rawSQL.slice(whereStartIndex);

  return knex.raw(whereClause, bindings).toString();
};

/**
 * Based on a relation string, get the outer most model
 * @param {QueryBuilder} builder
 * @param {String} relation
 */
const getOuterModel = function <M extends BaseModel>(
  builder: QueryBuilder<M>,
  relation: string,
): ModelClass<M> {
  const Model = builder.modelClass();
  let CurrentModel = Model;
  for (const relationName of relation.split('.')) {
    const currentRelation = CurrentModel.getRelations()[relationName];
    CurrentModel = currentRelation.relatedModelClass as ModelClass<M>;
  }
  return CurrentModel;
};

/**
 * Return a case statement which fills nulls with zeroes
 * @param {String} alias
 */
const nullToZero = function (
  tableAlias: string,
  columnAlias = 'count',
): RawBuilder {
  const column = `${tableAlias}.${columnAlias}`;
  return raw('case when ?? is null then 0 else cast(?? as decimal) end as ??', [
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
const buildAggregation = function <M extends BaseModel>(
  aggregation: AggregationConfig,
  builder: QueryBuilder<M>,
  utils: OperationUtils<M>,
) {
  const Model = builder.modelClass();
  const knex = Model.knex();
  const {
    relation,
    where,
    distinct = false,
    alias,
    type = 'count',
    field,
  } = aggregation;
  const { onAggBuild } = utils;

  const columnAlias = alias || type;

  // Do some initial validation
  if (!aggregationFunctions.includes(type)) {
    throw new Error(`Invalid type [${type}] for aggregation`);
  }
  if (type !== 'count' && !field) {
    throw new Error(`Must specify "field" with [${type}] aggregation`);
  }

  if (!relation) {
    const distinctTag = distinct ? 'distinct ' : '';

    let whereClause = '';

    if (where) {
      const requireQuery = applyRequire(
        where,
        Model.query() as unknown as QueryBuilder<M>,
        utils,
      );
      whereClause = `FILTER (${extractWhereClause(requireQuery, knex)})`;
    }

    return builder.select(
      knex.raw(`${type}(${distinctTag}??) ${whereClause} as ??`, [
        field
          ? `${Model.tableName}.${field}`
          : Model.idColumn
            ? `${Model.tableName}.${Model.idColumn}`
            : `${Model.tableName}.id`,
        columnAlias,
      ]),
    );
  }

  const baseIdColumn: string[] =
    typeof Model.idColumn === 'string'
      ? [Model.tableName + '.' + Model.idColumn]
      : Model.idColumn.map((idColumn) => Model.tableName + '.' + idColumn);

  // When joining the filter query, the base left-joined table is aliased
  // as the full relation name joined by the : character
  const relationNames = relation?.split('.') as string[];
  const fullOuterRelation = relationNames.join(':');

  // Filtering starts using the outermost model as a base
  const OuterModel = getOuterModel(builder, relation as string);

  const idColumns = _.isArray(OuterModel.idColumn)
    ? OuterModel.idColumn
    : [OuterModel.idColumn];
  const fullIdColumns =
    typeof idColumns === 'object'
      ? idColumns.map((idColumn) => `${fullOuterRelation}.${idColumn}`)
      : undefined;

  // Create the subquery for the aggregation with the base model as a starting point
  const distinctTag = distinct ? 'distinct ' : '';
  const aggregationQuery = Model.query()
    .select(baseIdColumn)
    .select(
      knex.raw(`${type}(${distinctTag}??) as ??`, [
        field
          ? `${fullOuterRelation}.${field}`
          : fullIdColumns
            ? fullIdColumns[0]
            : null,
        columnAlias,
      ]),
    )
    .leftJoinRelated(relation as string)
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
          this.on(
            `${aggModelAlias}.${relatedModelClass.idColumn}`,
            '=',
            `${fullyQualifiedRelation}.${relatedModelClass.idColumn}`,
          );
        });
      }
      CurrentModel = relatedModelClass as ModelClass<M>;
    }
  }

  // Apply the filtering using the outer model as a starting point
  const filterQuery = OuterModel.query().context(builder.context());
  applyRequire(
    where,
    filterQuery,
    utils as unknown as OperationUtils<BaseModel>,
  );
  const filterQueryAlias = 'filter_query';
  aggregationQuery.innerJoin(filterQuery.as(filterQueryAlias), function () {
    fullIdColumns?.forEach((fullIdColumn, index) => {
      this.on(fullIdColumn, '=', `${filterQueryAlias}.${idColumns[index]}`);
    });
  });

  aggregationQuery.groupBy(baseIdColumn);

  return aggregationQuery;
};

const applyAggregationsCurrentModel = function <M extends BaseModel>(
  aggregations: AggregationConfig[],
  builder: QueryBuilder<M>,
  utils: OperationUtils<M>,
) {
  aggregations = aggregations.filter(({ relation }) => !relation);

  if (aggregations.length === 0) {
    return;
  }

  aggregations.map((aggregation) =>
    buildAggregation(aggregation, builder, utils),
  );
};

const applyAggregations = function <M extends BaseModel>(
  aggregations: AggregationConfig[],
  builder: QueryBuilder<M>,
  utils: OperationUtils<M>,
) {
  aggregations = aggregations.filter(({ relation }) => relation);

  if (aggregations.length === 0) {
    return;
  }

  const Model = builder.modelClass();
  const aggAlias = (i: number) => `agg_${i}`;
  const idColumns = _.isArray(Model.idColumn)
    ? Model.idColumn
    : [Model.idColumn];
  const fullIdColumns =
    typeof idColumns === 'object'
      ? idColumns.map((id) => `${Model.tableName}.${id}`)
      : undefined;

  const aggregationQueries = aggregations.map((aggregation) =>
    buildAggregation(aggregation, builder, utils),
  );

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
        fullIdColumns?.forEach((fullIdColumn, j) => {
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
const isRelatedProperty = function (name: string) {
  return !!sliceRelation(name).relationName;
};

/**
 * Test all relations on a set of properties for a particular condition
 */
function testAllRelations<M extends BaseModel>(
  properties: string[],
  Model: ModelClass<M>,
  predicate: (relation: Relation) => boolean,
) {
  let testResult = true;
  for (const field of properties) {
    const { relationName } = sliceRelation(field);
    if (!relationName) {
      continue;
    }

    let rootModel: typeof ObjModel | ModelClass<M> = Model;
    for (const relatedModelName of relationName.split('.')) {
      const relation = rootModel.getRelation(relatedModelName) as Relation;
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
export function applyRequire<M extends BaseModel>(
  filter: RequireExpression = {},
  builder: QueryBuilder<M>,
  utils: OperationUtils<M>,
): QueryBuilder<M> {
  const { applyPropertyExpression } = utils;

  // If there are no properties at all, just return
  const propertiesSet = getPropertiesFromExpression(filter);
  if (propertiesSet.length === 0) {
    return builder;
  }

  const applyLogicalExpression = iterateLogicalExpression({
    onExit: function (propertyName, value, _builder) {
      applyPropertyExpression(
        propertyName as string,
        value as Expression,
        _builder as unknown as QueryBuilder<M>,
      );
    },
    onLiteral: function () {
      throw new Error('Filter is invalid');
    },
  });
  const getFullyQualifiedName = (name: string) =>
    sliceRelation(name, '.', Model.tableName).fullyQualifiedProperty;

  const Model = builder.modelClass();
  const idColumns = _.isArray(Model.idColumn)
    ? Model.idColumn
    : [Model.idColumn];
  const fullIdColumns =
    typeof idColumns === 'object'
      ? idColumns.map((idColumn) => `${Model.tableName}.${idColumn}`)
      : [];

  // If there are no related properties, don't join
  const relatedPropertiesSet = propertiesSet.filter(isRelatedProperty);
  if (relatedPropertiesSet.length === 0) {
    applyLogicalExpression(filter, builder, false, getFullyQualifiedName);
    return builder;
  }

  // If only joining belongsTo relationships, create a simpler query
  const isOnlyJoiningToBelongsTo: boolean = testAllRelations(
    propertiesSet,
    Model,
    (relation: unknown) =>
      relation instanceof Model.BelongsToOneRelation ||
      relation instanceof Model.HasOneRelation,
  );
  if (isOnlyJoiningToBelongsTo) {
    // If there are only belongsTo or hasOne relations, then filter on the main query
    applyLogicalExpression(filter, builder, false, getFullyQualifiedName);
    const joinRelation = createRelationExpression(propertiesSet) as string;
    builder.leftJoinRelated(joinRelation);
    return builder.select(`${builder.modelClass().tableName}.*`);
  }

  // If there are a hasMany or manyToMany relations, then create a separate filter query
  const filterQuery = Model.query()
    .distinct(...fullIdColumns)
    .context(builder.context());

  applyLogicalExpression(filter, filterQuery, false, getFullyQualifiedName);

  // If there were related properties, join onto the filter
  const joinRelation = createRelationExpression(propertiesSet) as string;
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
export function applyOrder<M extends BaseModel>(
  order: string | undefined,
  builder: QueryBuilder<M>,
): QueryBuilder<M> {
  if (!order) {
    return builder;
  }
  const Model = builder.modelClass();

  order.split(',').forEach((orderStatement) => {
    const [orderProperty, direction = 'asc'] = orderStatement
      .trim()
      .split(' ') as [string, OrderByDirection];
    const { propertyName, relationName } = sliceRelation(orderProperty);

    // Use fieldExpressionRef to sort if necessary
    const orderBy = (
      queryBuilder: QueryBuilder<ObjModel, ObjModel[]>,
      fullyQualifiedColumn: string,
    ) => {
      if (isFieldExpression(fullyQualifiedColumn)) {
        const ref = getFieldExpressionRef(fullyQualifiedColumn);
        queryBuilder.orderBy(ref, direction);
      } else {
        queryBuilder.orderBy(fullyQualifiedColumn, direction);
      }
    };

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedColumn = `${Model.tableName}.${propertyName}`;
      return orderBy(
        builder as unknown as QueryBuilder<ObjModel, ObjModel[]>,
        fullyQualifiedColumn,
      );
    }

    // For now, only allow sub-query ordering of eager expressions
    builder.modifyGraph(relationName, (eagerBuilder) => {
      const fullyQualifiedColumn = `${
        eagerBuilder.modelClass().tableName
      }.${propertyName}`;
      orderBy(eagerBuilder, fullyQualifiedColumn);
    });
  });

  return builder;
}

/**
 * Based on a relation name, select a subset of fields. Do nothing if there are no fields
 * @param {Builder} builder An instance of a knex builder
 * @param {Array<String>} fields A list of fields to select
 */
function selectFields<M extends BaseModel>(
  fields: string[],
  builder: QueryBuilder<M>,
  relationName?: string,
): QueryBuilder<M> {
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
    eaQueryBuilder.select(
      fields.map(
        (field) => `${eaQueryBuilder.modelClass().tableName}.${field}`,
      ),
    );
  });
}

/**
 * Select a limited set of fields. Use dot notation to limit ealy loaded models.
 * @param {Array<String>} fields An array of dot notation fields
 * @param {QueryBuilder} builder The root query builder
 */
export function applyFields<M extends BaseModel>(
  fields: string[] = [],
  builder: QueryBuilder<M>,
): QueryBuilder<M> {
  const Model = builder.modelClass();

  // Group fields by relation e.g. ["a.b.name", "a.b.id"] => {"a.b": ["name", "id"]}
  const rootFields: string[] = []; // Fields on the root model
  const fieldsByRelation = fields.reduce(
    (obj: { [key: string]: [string] }, fieldName) => {
      const { propertyName, relationName } = sliceRelation(fieldName);
      if (!relationName) {
        rootFields.push(`${Model.tableName}.${propertyName}`);
      } else {
        // Push it into an array keyed by relationName
        obj[relationName] = obj[relationName] || [];
        obj[relationName].push(propertyName);
      }
      return obj;
    },
    {},
  );

  // Root fields
  selectFields(rootFields, builder);

  // Related fields
  _.map(fieldsByRelation, (_fields, relationName) =>
    selectFields(_fields, builder, relationName),
  );

  return builder;
}

export function applyPage<M extends BaseModel>(
  limit: number | undefined,
  offset: number | undefined = 0,
  builder: QueryBuilder<M>,
  defaultPageLimit: number,
): QueryBuilder<M> {
  limit = !limit || limit > defaultPageLimit ? defaultPageLimit : limit;

  builder.page(offset / limit, limit);

  return builder;
}

export function applyLimit<M extends BaseModel>(
  limit: number | undefined,
  offset: number | undefined,
  builder: QueryBuilder<M>,
  defaultPageLimit: number,
): QueryBuilder<M> {
  limit = !limit || limit > defaultPageLimit ? defaultPageLimit : limit;
  if (limit) {
    builder.limit(limit);
  }
  if (offset) {
    builder.offset(offset);
  }

  return builder;
}

export function applyInclude<M extends BaseModel>(
  include: string[] | undefined,
  builder: QueryBuilder<M>,
): QueryBuilder<M> {
  if (include) {
    include.forEach((model) => builder.withGraphFetched(model));
  }

  return builder;
}
