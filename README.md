# objection-filter-expression

## What is objection-filter-expression?

objection-filter-expression is a plugin, based on the [objection.js](https://github.com/Vincit/objection.js) ORM. It's designed to allow powerful filters and aggregations on your API. It's based on the [objection-filter](https://github.com/tandg-digital/objection-filter).

Some examples of what you can do include:

#### 1. Filtering on nested relations

For example, if you have the models _Customer_ belongsTo _City_ belongsTo _Country_, we can query all _Customers_ where the _Country_ starts with `A`.

#### 2. Loading data

Load a bunch of related data in a single query. This is useful for getting a list models e.g. _Customers_ then including all their _Orders_ in the same query.

#### 3. Aggregation and reporting

Creating quick counts and sums on a model can speed up development significantly. An example could be the _numberOfOrders_ for a _Customer_ model.

#### 4. Returning

The returned data is paginated by default and has a max limit of 100 records.
You can specify the max limit with the field `defaultPageLimit`in the definition of the class.

## Usage

The filtering library can be applied onto every _findAll_ REST endpoint e.g. `GET /api/{Model}?filter={"limit": 1}`

A typical express route handler with a filter applied:

```js
const { buildFilter } = require('objection-filter');
const { Customer } = require('./models');

app.get('/Customers', function (req, res, next) {
  buildFilter(Customer)
    .build(JSON.parse(req.query.filter))
    .then((customers) => res.send(customers))
    .catch(next);
});
```

Available filter properties include:

```js
// GET /api/Customers
{
  // Top level where filters on the root model
  "where": {
    "firstName": "John"
    "profile.isActivated": true,
    "city.country": { "like": "A" }
  },
  // An objection.js order by expression
  "order": "firstName desc",
  "limit": 10,
  "offset": 10,
  // An array of dot notation fields to select on the root model
  "fields": ["firstName", "lastName", "orders.code", "products.name"]
}
```

## Filter Operators

There are a number of built-in operations that can be applied to columns (custom ones can also be created). These include:

1. **like** - The SQL _LIKE_ operator, can be used with expressions such as _ab%_ to search for strings that start with _ab_
2. **gt/lt/gte/lte** - Greater than and Less than operators for numerical fields
3. **=/equals** - Explicitly specify equality
4. **in** - Whether the target value is in an array of values
5. **exists** - Whether a property is not null
6. **or** - A top level _OR_ conditional operator

For any operators not available (eg _ILIKE_, refer to the custom operators section below).

#### Example

An example of operator usage

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

#### Custom Operators

If the built in filter operators aren't quite enough, custom operators can be added. A common use case for this may be to add a `lower case LIKE` operator, which may vary in implementation depending on the SQL dialect.

Example:

```js
const options = {
  operators: {
    ilike: (property, operand, builder) =>
      builder.whereRaw('?? ILIKE ?', [property, operand]),
  },
};

buildFilter(Person, null, options).build({
  where: {
    firstName: { ilike: 'John' },
  },
});
```

The `ilike` operator can now be used as a new operator and will use the custom operator callback specified.

## Logical Expressions

Logical expressions can be applied to both the `where` and `require` helpers.

#### Examples using `where`

The `where` expression is used to "filter models". Given this, related fields between models can be mixed anywhere in the logical expression.

```json
{
  "where": {
    "or": [{ "city.country.name": "Australia" }, { "city.code": "09" }]
  }
}
```

Logical expressions can also be nested

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

Note that in these examples, all logical expressions come _before_ the property name. However, logical expressions can also come _after_ the property name.

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

The `where` will apply to the relation that immediately precedes it in the tree, in the above case "city". The `where` will apply to relations of the model using dot notation. For example, you can query `Customers`, load their `orders` and filter those orders by the `product.name`. Note that `product.name` is a related field of the order model, not the customers model.

### JSONB column search

-> **PostgreSQL ONLY**

JSONB column filtering using the [FieldExpression](https://vincit.github.io/objection.js/api/types/#type-fieldexpression) syntax

You can search on JSONB columns using `$` operator. For example, if you have a JSONB column `customData` with the following structure:

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

You can also search on numbers like this:

```json
{
  "where": {
    "customData$testNumber": 6
  }
}
```

or with number operators like this:

```json
{
  "where": {
    "customData$testNumber": {
      "gt": 5
    }
  }
}
```

```json
{
  "where": {
    "customData$content.testNumber": {
      "in": [4, 5, 6]
    }
  }
}
```

or with exists operator like this:

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

[Aggregations](doc/AGGREGATIONS.md) such as _count, sum, min, max, avg_ can be applied to the queried model.

Additionally for any aggregations, you can use them in other expressions above including:

- Filtering using `where`
- Ordering using `order`

For more detailed descriptions of each feature, refer to the [aggregations section](doc/AGGREGATIONS.md).

Transform a basic aggregation like this on a `GET /Customers` endpoint:

```js
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

...into a result set like this:

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

## Protected words

1. like
2. gt/lt/gte/lte
3. =/equals
4. in
5. exists
6. or
7. fields
8. limit
9. offset
10. order
11. where
12. aggregations

## Known issues

1. The search filter on JSON doesn't accept array search. It only supports object search.
