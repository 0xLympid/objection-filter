"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
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
__exportStar(require("./lib/types"), exports);
function buildFilter(modelClass, trx, options) {
    return new exports.FilterQueryBuilder(modelClass, trx, options);
}
exports.FilterQueryBuilder = FilterQueryBuilder_1.default;
exports.sliceRelation = utils_1.sliceRelation;
exports.createRelationExpression = ExpressionBuilder_1.createRelationExpression;
exports.getPropertiesFromExpression = LogicalIterator_1.getPropertiesFromExpression;
//# sourceMappingURL=index.js.map