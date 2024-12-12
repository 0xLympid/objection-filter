"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sliceRelation = sliceRelation;
exports.Operations = Operations;
exports.isFieldExpression = isFieldExpression;
exports.getFieldExpressionRef = getFieldExpressionRef;
exports.castTo = castTo;
/**
 * The utils helpers are a set of common helpers to be passed around during
 * filter execution. It stores all default operators, custom operators and
 * functions which directly touch these operators.
 */
const lodash_1 = __importDefault(require("lodash"));
const objection_1 = require("objection");
const LogicalIterator_1 = require("./LogicalIterator");
/**
 * For a property "a.b.c", slice it into relationName: "a.b", "propertyName": "c" and
 * a fully qualified property "a:b.c"
 * @param {String} relatedProperty A dot notation property "a.b.c"
 * @param {String} delimiter A delimeter to use on the relation e.g. "." or ":"
 */
function sliceRelation(relatedProperty, delimiter = '.', rootTableName, fieldExpressionDelimiter = '$') {
    let jsonProperty;
    [relatedProperty, jsonProperty] = relatedProperty.split(fieldExpressionDelimiter);
    const split = relatedProperty.split('.');
    let propertyName = split[split.length - 1];
    if (jsonProperty) {
        propertyName += `${fieldExpressionDelimiter}${jsonProperty}`;
    }
    const relationName = split.slice(0, split.length - 1).join(delimiter);
    // Nested relations need to be in the format a:b:c.name
    // https://github.com/Vincit/objection.js/issues/363
    const fullyQualifiedProperty = relationName
        ? `${relationName.replace(/\./g, ':')}.${propertyName}`
        : rootTableName
            ? `${rootTableName}.${propertyName}`
            : propertyName;
    return { propertyName, relationName, fullyQualifiedProperty };
}
/**
 * Create operation application utilities with some custom options
 * If options.operators is specified
 * @param {Object} options.operators
 * @param {Function} options.onAggBuild A utility function to filter aggregations per model
 */
function Operations(options) {
    const defaultOperators = {
        'like': (property, operand, builder) => {
            return builder.where((0, objection_1.raw)('LOWER(??)', [property]), 'like', `%${typeof operand === 'string' ? operand.toLowerCase() : operand}%`);
        },
        'lt': (property, operand, builder) => {
            return builder.where(property, '<', operand);
        },
        'gt': (property, operand, builder) => {
            return builder.where(property, '>', operand);
        },
        'lte': (property, operand, builder) => {
            return builder.where(property, '<=', operand);
        },
        'gte': (property, operand, builder) => {
            return builder.where(property, '>=', operand);
        },
        '!=': (property, operand, builder) => {
            return builder.where((query) => {
                query.whereNot(property, '=', operand).orWhereNull(property);
            });
        },
        'neq': (property, operand, builder) => {
            return builder.where((query) => {
                query.whereNot(property, '=', operand).orWhereNull(property);
            });
        },
        'eq': (property, operand, builder) => {
            return builder.where(property, operand);
        },
        'equals': (property, operand, builder) => {
            return builder.where(property, operand);
        },
        '=': (property, operand, builder) => {
            return builder.where(property, operand);
        },
        'in': (property, operand, builder) => {
            return (builder
                // HACK: Use an unknown cast temporarily
                .whereIn(property, operand));
        },
        'nin': (property, operand, builder) => {
            return builder.where((query) => {
                query
                    .whereNotIn(property, operand)
                    .orWhereNull(property);
            });
        },
        'exists': (property, operand, builder) => {
            return operand
                ? builder.whereNotNull(property)
                : builder.whereNull(property);
        },
        /**
         * @param {String} property
         * @param {Array} items Must be an array of objects/values
         * @param {QueryBuilder} builder
         */
        'or': (property, items, builder) => {
            const onExit = function (operator, value, subQueryBuilder) {
                const operationHandler = getOperationHandler(operator);
                operationHandler &&
                    operationHandler(property, value, subQueryBuilder);
            };
            const onLiteral = function (value, subQueryBuilder) {
                onExit('equals', value, subQueryBuilder);
            };
            // Iterate the logical expression until it hits an operation e.g. gte
            const iterateLogical = (0, LogicalIterator_1.iterateLogicalExpression)({ onExit, onLiteral });
            // Wrap within another builder context to prevent end-of-expression errors
            // TODO: Investigate the consequences of not using this wrapper
            return builder.where((subQueryBuilder) => {
                iterateLogical({ or: items }, subQueryBuilder, true);
            });
        },
        'and': (property, items, builder) => {
            const onExit = function (operator, value, subQueryBuilder) {
                const operationHandler = getOperationHandler(operator);
                operationHandler &&
                    operationHandler(property, value, subQueryBuilder);
            };
            const onLiteral = function (value, subQueryBuilder) {
                onExit('equals', value, subQueryBuilder);
            };
            // Iterate the logical expression until it hits an operation e.g. gte
            const iterateLogical = (0, LogicalIterator_1.iterateLogicalExpression)({ onExit, onLiteral });
            // Wrap within another builder context to prevent end-of-expression errors
            return builder.where((subQueryBuilder) => {
                iterateLogical({ and: items }, subQueryBuilder, false);
            });
        },
    };
    const { operators, onAggBuild } = options;
    // Custom operators override default operators
    const allOperators = Object.assign(Object.assign({}, defaultOperators), operators);
    // TODO: Generalize
    function isPrimitive(expression) {
        return typeof expression !== 'object';
    }
    /**
     * Returns the operationHandler by name. Builds a reference to the property if necessary.
     * @param operator name of the operator
     */
    function getOperationHandler(operator) {
        const operationHandler = allOperators[operator];
        if (!operationHandler) {
            return undefined;
        }
        if ((0, LogicalIterator_1.hasSubExpression)(operator)) {
            return operationHandler;
        }
        else {
            return (property, operand, builder) => {
                if (typeof property === 'string' && isFieldExpression(property)) {
                    let propertyRef = getFieldExpressionRef(property);
                    propertyRef = castTo(propertyRef, operand);
                    return operationHandler(propertyRef, operand, builder);
                }
                return operationHandler(property, operand, builder);
            };
        }
    }
    /**
     * Apply a subset of operators on a single property
     * @param {String} propertyName
     * @param {Object} expression
     * @param {QueryBuilder} builder
     */
    const applyPropertyExpression = function (propertyName, expression, builder) {
        // If the rhs is a primitive, assume equality
        if (isPrimitive(expression)) {
            const operationHandler = getOperationHandler('equals');
            if (!operationHandler) {
                return;
            }
            return operationHandler(propertyName, expression, builder);
        }
        for (const lhs in expression) {
            const rhs = expression[lhs];
            const operationHandler = getOperationHandler(lhs);
            if (!operationHandler) {
                continue;
            }
            operationHandler(propertyName, rhs, builder);
        }
    };
    return { applyPropertyExpression, onAggBuild };
}
/**
 * Determines if a property is a [FieldExpression](https://vincit.github.io/objection.js/api/types/#type-fieldexpression)
 * @param property The property to check
 */
function isFieldExpression(property) {
    return property.indexOf('$') > -1;
}
/**
 * Builds a reference for a FieldExpression with support for fully-qualified properties
 * @param property a FieldExpression string
 */
function getFieldExpressionRef(property) {
    const isFullyQualified = property.indexOf(':') > -1;
    if (isFullyQualified) {
        let { propertyName, relationName } = sliceRelation(property, ':');
        relationName = relationName.replace('.', ':');
        propertyName = propertyName.replace('$', ':');
        return (0, objection_1.ref)(propertyName).from(relationName);
    }
    const propertyName = property.replace('$', ':');
    return (0, objection_1.ref)(propertyName);
}
/**
 * Casts a ReferenceBuilder instance to a type based on the type of the operand
 * @param reference A reference built from a filterExpression
 * @param operand the operand from which to infer the type
 */
function castTo(reference, operand) {
    const type = typeof operand;
    // 'in' operation
    if (type === 'object' && lodash_1.default.isArray(operand) && operand.length > 0) {
        if (typeof operand[0] === 'string') {
            return reference.castText();
        }
        else if (typeof operand[0] === 'number') {
            return reference.castDecimal();
        }
    }
    // 'boolean' can be 'exists' operation
    if (type === 'string' || type === 'boolean') {
        return reference.castText();
    }
    // if (type === 'boolean') {
    //   return reference.castBool();
    // }
    if (type === 'number') {
        return reference.castDecimal();
    }
    // Don't cast by default
    return reference;
}
//# sourceMappingURL=utils.js.map