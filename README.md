# objection-filter-expression

## What is objection-filter-expression?

`objection-filter-expression` is a plugin based on the [objection.js](https://github.com/Vincit/objection.js) ORM. It's designed to allow powerful filters and aggregations on your API, drawing inspiration from [objection-filter](https://github.com/tandg-digital/objection-filter).

Some examples of what you can do include:

### 1. Filtering on Nested Relations

For instance, if you have models where _Customer_ belongs to _City_ and _City_ belongs to _Country_, you can query all _Customers_ where the _Country_ starts with `A`.

### 2. Loading Data

Load a bunch of related data in a single query. This is useful for getting a list of models, e.g., _Customers_, and including all their _Orders_ in the same query.

### 3. Aggregation and Reporting

Quickly create counts and sums on a model, significantly speeding up development. For example, you can get the _numberOfOrders_ for a _Customer_ model.

### 4. Returning Data

The returned data is paginated by default and has a max limit of 100 records. You can specify the max limit with the field `defaultPageLimit` in the class definition.

## Usage

The filtering library can be applied to every _findAll_ REST endpoint, e.g., `GET /api/{Model}?filter={"limit": 1}`.

### 1. Paginated query

```js
const { buildFilter } = require('objection-filter');
const { Customer } = require('./models');

app.get('/Customers', function (req, res, next) {
  buildFilter(Customer)
    .paginated(JSON.parse(req.query.filter))
    .then(({ results: customers }) => res.send(customers))
    .catch(next);
});

// returns: {
//    results: M[]
//    total: number
// }
```

### 2. List query

```js
const { buildFilter } = require('objection-filter');
const { Customer } = require('./models');

app.get('/Customers', function (req, res, next) {
  buildFilter(Customer)
    .build(JSON.parse(req.query.filter))
    .then(({ results: customers }) => res.send(customers))
    .catch(next);
});

// returns: `M[]`
```


### 3. Get first query

```js
const { buildFilter } = require('objection-filter');
const { Customer } = require('./models');

app.get('/Customers', function (req, res, next) {
  buildFilter(Customer)
    .first(JSON.parse(req.query.filter))
    .then(({ results: customers }) => res.send(customers))
    .catch(next);
});
// returns: M | undefined
```

### Available Filter Properties

```js
// GET /api/Customers
{
  // Top level where filters on the root model
  "where": {
    "firstName": "John",
    "profile.isActivated": true,
    "city.country": { "like": "A" }
  },
  // An objection.js order by expression
  "order": "firstName desc",
  "limit": 10,
  "offset": 10,
  // An array of dot notation fields to select on the root model
  "fields": ["firstName", "lastName", "orders.code", "products.name"],
  "include": ["profile"]
}
```

## Filter Operators

There are a number of built-in operations that can be applied to columns (custom ones can also be created). These include:

1. **like** - The SQL _LIKE_ operator, which can be used with expressions such as _ab%_ to search for strings that start with _ab_.
2. **gt/lt/gte/lte** - Greater than and less than operators for numerical fields.
    - lte - <=
    - lt - <
    - gte - >=
    - gt - >
3. **=/eq/equals** - Explicitly specify equality.
4. **!=/neq** - Explicitly specify inequality.
5. **in/nin** - Whether the target value is in or not in an array of values.
6. **exists** - Whether a property is not null.
7. **or** - A top-level _OR_ conditional operator.

For operators not available (e.g., _ILIKE_), refer to the custom operators section below.

### Example of Operator Usage

```json
{
  "where": {
    "property0": "Exactly Equals",
    "property1": {
      "equals": 5
    },
    "property2": {
      "gt": 5
    },
    "property3": {
      "lt": 10,
      "gt": 5
    },
    "property4": {
      "in": [1, 2, 3]
    },
    "property5": {
      "exists": false
    },
    "property6": {
      "or": [{ "in": [1, 2, 3] }, { "equals": 100 }]
    },
    "property7": {
      "jsonSearch&first.test.prop": "test"
    }
  }
}
```

## Custom Operators

If the built-in filter operators aren't enough, custom operators can be added. A common use case might be adding a `lowercase LIKE` operator, which may vary depending on the SQL dialect.

### Example of a Custom Operator

```js
const options = {
  operators: {
    ilike: (property, operand, builder) =>
      builder.whereRaw('?? ILIKE ?', [property, operand]),
  },
};

buildFilter(Person, null, options).get({
  where: {
    firstName: { ilike: 'John' },
  },
});
```

The `ilike` operator can now be used as a new operator, using the custom operator callback specified.

## Logical Expressions

Logical expressions can be applied to both the `where` and `require` helpers.

### Examples Using `where`

The `where` expression is used to "filter models." Related fields between models can be mixed anywhere in the logical expression.

```json
{
  "where": {
    "or": [{ "city.country.name": "Australia" }, { "city.code": "09" }]
  }
}
```

Logical expressions can also be nested:

```json
{
  "where": {
    "and": {
      "name": "John",
      "or": [
        { "city.country.name": "Australia" },
        { "city.code": { "like": "01" } }
      ]
    }
  }
}
```

In these examples, all logical expressions come _before_ the property name. However, logical expressions can also come _after_ the property name:

```json
{
  "where": {
    "or": [
      { "city.country.name": "Australia" },
      {
        "city.code": {
          "or": [{ "equals": "12" }, { "like": "13" }]
        }
      }
    ]
  }
}
```

The `where` will apply to the relation that immediately precedes it in the tree. In the above case, this is "city." The `where` applies to relations of the model using dot notation. For example, you can query `Customers`, load their `orders`, and filter those orders by the `product.name`. Note that `product.name` is a related field of the order model, not the customers model.

## JSONB Column Search

-> **PostgreSQL ONLY**

JSONB column filtering using the [FieldExpression](https://vincit.github.io/objection.js/api/types/#type-fieldexpression) syntax.

You can search on JSONB columns using the `$` operator. For example, if you have a JSONB column `customData` with the following structure:

```json
{
  "network": "btc",
  "data": {
    "info": "Some text"
  },
  "testNumber": 6
}
```

You can search on the `network` field like this:

```json
{
  "where": {
    "customData$network": "btc"
  }
}
```

You can also search on nested fields like this:

```json
{
  "where": {
    "customData$data.info": "Some text"
  }
}
```

Or search on numbers like this:

```json
{
  "where": {
    "customData$testNumber": 6
  }
}
```

Or with number operators:

```json
{
  "where": {
    "customData$testNumber": {
      "gt": 5
    }
  }
}
```

Or with the `exists` operator:

```json
{
  "where": {
    "customData$propertyName": {
      "exists": true
    }
  }
}
```

## Aggregations

[Aggregations](doc/AGGREGATIONS.md) such as _count_, _sum_, _min_, _max_, and _avg_ can be applied to the queried model.

You can use these aggregations in other expressions, including:

- Filtering using `where`
- Ordering using `order`

For more detailed descriptions of each feature, refer to the [aggregations section](doc/AGGREGATIONS.md).

### Transforming a Basic Aggregation

Transform a basic aggregation on a `GET /Customers` endpoint:

```json
{
  "aggregations": [
    {
      "type": "count",
      "alias": "numberOfOrders",
      "relation": "orders"
    }
  ]
}
```

Into a result set like this:

```json
[
  {
    "firstName": "John",
    "lastName": "Smith",
    "numberOfOrders": 10
  },
  {
    "firstName": "Jane",
    "lastName": "Bright",
    "numberOfOrders": 5
  },
  {
    "firstName": "Greg",
    "lastName": "Parker",
    "numberOfOrders": 7
  }
]
```

## Protected Words

1. like
2. gt/lt/gte/lte
3. =/eq/equals
4. !=/neq
5. in
6. nin
7. exists
8. or
9. fields
10. limit
11. offset
12. order
13. where
14. aggregations

## Known Issues

1. The search filter on JSON doesn't accept array search. It only supports object search. ? FIXED ?

## TODOS:

- Remove dependencies:
  - bluebird
  - nyc
