"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPropertiesFromExpression = exports.createRelationExpression = exports.sliceRelation = exports.FilterQueryBuilder = void 0;
exports.buildFilter = buildFilter;
const ExpressionBuilder_1 = require("./lib/ExpressionBuilder");
const FilterQueryBuilder_1 = __importDefault(require("./lib/FilterQueryBuilder"));
const LogicalIterator_1 = require("./lib/LogicalIterator");
const utils_1 = require("./lib/utils");
function buildFilter(modelClass, trx, options) {
    return new exports.FilterQueryBuilder(modelClass, trx, options);
}
exports.FilterQueryBuilder = FilterQueryBuilder_1.default;
exports.sliceRelation = utils_1.sliceRelation;
exports.createRelationExpression = ExpressionBuilder_1.createRelationExpression;
exports.getPropertiesFromExpression = LogicalIterator_1.getPropertiesFromExpression;
//# sourceMappingURL=index.js.map