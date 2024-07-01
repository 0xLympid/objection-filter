import { Transaction, Model } from 'objection';

import { createRelationExpression as _createRelationExpression } from './lib/ExpressionBuilder';
import _FilterQueryBuilder from './lib/FilterQueryBuilder';
import { getPropertiesFromExpression as _getPropertiesFromExpression } from './lib/LogicalIterator';
import { BaseModel, FilterQueryBuilderOptions } from './lib/types';
import { sliceRelation as _sliceRelation } from './lib/utils';

export function buildFilter<M extends BaseModel, K extends typeof Model>(
  modelClass: K,
  trx?: Transaction,
  options?: FilterQueryBuilderOptions<M>,
): _FilterQueryBuilder<M, K> {
  return new FilterQueryBuilder(modelClass, trx, options);
}
export const FilterQueryBuilder = _FilterQueryBuilder;
export const sliceRelation = _sliceRelation;
export const createRelationExpression = _createRelationExpression;
export const getPropertiesFromExpression = _getPropertiesFromExpression;
export { BaseModel, FilterQueryBuilderOptions };
