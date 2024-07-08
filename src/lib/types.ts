import { QueryBuilder, Model, ReferenceBuilder } from 'objection';

// Shared types
export interface Relation {
  propertyName: string;
  relationName: string;
  fullyQualifiedProperty: string;
}

export type Primitive = number | string | boolean | null;

export interface BaseModel extends Model {
  count?: number;
}

// OperationOptions types and subtypes
export type OperationHandler<M extends Model> = (
  property: string | ReferenceBuilder,
  operand: Expression | ExpressionValue,
  builder: QueryBuilder<M>,
) => QueryBuilder<M> | undefined;

export type Operators<M extends Model> = {
  [f: string]: OperationHandler<M>;
};

export type AggregationCallback = <M extends Model, K extends typeof Model>(
  RelatedModelClass: K,
) => QueryBuilder<M>;

export interface OperationOptions<M extends Model> {
  operators: Operators<M>;
  onAggBuild: AggregationCallback | undefined;
}

export interface OperationUtils<M extends Model> {
  applyPropertyExpression: OperationHandler<M>;
  onAggBuild: AggregationCallback | undefined;
}

// LogicalIterator types and subtypes
export type ExpressionValue =
  | Expression
  | string
  | number
  | boolean
  | string[]
  | number[];
export type ExpressionObject = {
  [key: string]: ExpressionValue;
};
export type Expression =
  | ExpressionObject
  | ExpressionObject[]
  | string
  | number
  | boolean
  | string[]
  | number[];
export type PropertyOmissionPredicate = (propertyName?: string) => boolean;

export type Item = {
  [x: string]: unknown;
};

export type LogicalIteratorExitFunction<M extends Model> = (
  operator: string | ReferenceBuilder,
  value: Primitive,
  subQueryBuilder: QueryBuilder<M>,
) => void;
export type LogicalIteratorLiteralFunction<M extends Model> = (
  value: Primitive,
  subQueryBuilder: QueryBuilder<M>,
) => void;

export interface LogicalExpressionIteratorOptions<M extends Model> {
  onExit: LogicalIteratorExitFunction<M>;
  onLiteral: LogicalIteratorLiteralFunction<M>;
}

// FilterQueryBuilder types and subtypes
export interface FilterQueryBuilderOptions<M extends Model> {
  operators?: Operators<M>;
  onAggBuild?: AggregationCallback;
  builder?: QueryBuilder<M>;
  defaultPageLimit?: number;
}

export interface FilterQueryParams {
  fields?: string[];
  limit?: number;
  offset?: number;
  order?: string;
  where?: Expression;
  require?: Expression;
  aggregations?: AggregationConfig[];
}

export interface AggregationConfig {
  relation?: string;
  where?: Expression;
  distinct?: boolean;
  alias?: string;
  type?: string;
  field?: string;
}

export type RequireExpression = Expression;

export type StringFormatter = (s: string) => string;

export type LogicalIterator = <M extends Model>(
  expression: Expression,
  builder: QueryBuilder<M>,
  or?: boolean,
  propertyTransform?: StringFormatter,
) => void;
