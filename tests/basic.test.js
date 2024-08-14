const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../dist');

describe('basic filters', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
    describe(knexConfig.client, function () {
      let session, Person, Movie, MovieVersion;

      before(function () {
        session = testUtils.initialize(knexConfig);
        Person = session.models.Person;
        Movie = session.models.Movie;
        MovieVersion = session.models.MovieVersion;
      });

      before(function () {
        return testUtils.dropDb(session);
      });

      before(function () {
        return testUtils.createDb(session);
      });

      before(function () {
        return testUtils.insertData(session, {
          persons: 10,
          pets: 10,
          movies: 10,
        });
      });

      describe('filter attributes', function () {
        it('should limit', async () => {
          const result = await buildFilter(Person).build({
            limit: 1,
          });
          result.should.be.an.an('array');
          result.should.have.length(1);
        });

        it('should offset', async () => {
          const result = await buildFilter(Person).build({
            limit: 1,
            offset: 1,
          });
          result.should.be.an.an('array');
          result.should.have.length(1);
          result[0].firstName.should.equal('F01');
        });

        it('should select single field using alias', async () => {
          const query = buildFilter(Person).build({
            limit: 1,
            fields: ['id'],
          });
          query
            .toKnexQuery()
            .toSQL()
            .sql.replace(/"|`/g, '')
            .should.equal('select Person.id as id from Person limit ?');
          const result = await query;
          result.should.be.an.an('array');
          result.should.have.length(1);
          _.keys(result[0]).should.deep.equal(['id']);
        });

        it('should select limited fields', async () => {
          const result = await buildFilter(Person).build({
            limit: 1,
            fields: ['id', 'firstName'],
          });
          result.should.be.an.an('array');
          result.should.have.length(1);
          _.keys(result[0]).should.deep.equal(['id', 'firstName']);
        });

        it('should order by descending', async () => {
          const result = await buildFilter(Person).build({
            order: 'id desc',
          });
          result.should.be.an.an('array');
          result
            .map((item) => item.id)
            .should.deep.equal([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
        });

        it('should order by ascending', async () => {
          const result = await buildFilter(Person).build({
            order: 'id asc',
          });
          result.should.be.an.an('array');
          result
            .map((item) => item.id)
            .should.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        });

        it('should order by implicit ascending', async () => {
          const result = await buildFilter(Person).build({
            order: 'id',
          });
          result.should.be.an.an('array');
          result
            .map((item) => item.id)
            .should.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        });

        it('should order by multiple columns', async () => {
          const result = await buildFilter(Movie).build({
            order: 'seq,id',
          });
          result
            .map((item) => item.id)
            .should.deep.equal(
              _.sortBy(result, ['seq', 'id']).map(({ id }) => id),
            );
        });

        it('should order by multiple columns with space', async () => {
          const result = await buildFilter(Movie).build({
            order: 'seq, id',
          });
          result
            .map((item) => item.id)
            .should.deep.equal(
              _.sortBy(result, ['seq', 'id']).map(({ id }) => id),
            );
        });

        it('should order by property added in model modifier', async () => {
          const builder = Person.query().modify('withBirthYear');
          const result = await buildFilter(Person, null, {
            builder,
          }).build({
            order: 'birthYear, id',
          });
          result
            .map((item) => item.id)
            .should.deep.equal(
              _.sortBy(result, ['birthYear', 'id']).map(({ id }) => id),
            );
        });
        it('should accept the difference operator', async () => {
          const result = await buildFilter(Person).build({
            where: {
              firstName: { '!=': 'F00' },
            },
          });

          result.should.be.an.an('array');
          result.should.have.length(9);
          result[0].firstName.should.equal('F01');
        });
      });

      describe('filter attributes paginated', function () {
        it('should limit', async () => {
          const { results } = await buildFilter(Person).paginated({
            limit: 1,
          });
          results.should.be.an.an('array');
          results.should.have.length(1);
        });

        it('should offset', async () => {
          const { results } = await buildFilter(Person).paginated({
            limit: 1,
            offset: 1,
          });
          results.should.be.an.an('array');
          results.should.have.length(1);
          results[0].firstName.should.equal('F01');
        });

        it('should select single field using alias', async () => {
          const query = buildFilter(Person).paginated({
            limit: 1,
            fields: ['id'],
          });
          query
            .toKnexQuery()
            .toSQL()
            .sql.replace(/"|`/g, '')
            .should.equal('select Person.id as id from Person limit ?');
          const { results } = await query;
          results.should.be.an.an('array');
          results.should.have.length(1);
          _.keys(results[0]).should.deep.equal(['id']);
        });

        it('should select limited fields', async () => {
          const { results } = await buildFilter(Person).paginated({
            limit: 1,
            fields: ['id', 'firstName'],
          });
          results.should.be.an.an('array');
          results.should.have.length(1);
          _.keys(results[0]).should.deep.equal(['id', 'firstName']);
        });

        it('should order by descending', async () => {
          const { results } = await buildFilter(Person).paginated({
            order: 'id desc',
          });
          results.should.be.an.an('array');
          results
            .map((item) => item.id)
            .should.deep.equal([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
        });

        it('should order by ascending', async () => {
          const { results } = await buildFilter(Person).paginated({
            order: 'id asc',
          });
          results.should.be.an.an('array');
          results
            .map((item) => item.id)
            .should.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        });

        it('should order by implicit ascending', async () => {
          const { results } = await buildFilter(Person).paginated({
            order: 'id',
          });
          results.should.be.an.an('array');
          results
            .map((item) => item.id)
            .should.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        });

        it('should order by multiple columns', async () => {
          const { results } = await buildFilter(Movie).paginated({
            order: 'seq,id',
          });
          results
            .map((item) => item.id)
            .should.deep.equal(
              _.sortBy(results, ['seq', 'id']).map(({ id }) => id),
            );
        });

        it('should order by multiple columns with space', async () => {
          const { results } = await buildFilter(Movie).paginated({
            order: 'seq, id',
          });
          results
            .map((item) => item.id)
            .should.deep.equal(
              _.sortBy(results, ['seq', 'id']).map(({ id }) => id),
            );
        });

        it('should order by property added in model modifier', async () => {
          const builder = Person.query().modify('withBirthYear');
          const { results } = await buildFilter(Person, null, {
            builder,
          }).paginated({
            order: 'birthYear, id',
          });
          results
            .map((item) => item.id)
            .should.deep.equal(
              _.sortBy(results, ['birthYear', 'id']).map(({ id }) => id),
            );
        });
        it('should accept the difference operator', async () => {
          const {results} = await buildFilter(Person).paginated({
            where: {
              firstName: { '!=': 'F00' },
            },
          });

          results.should.be.an.an('array');
          results.should.have.length(9);
          results[0].firstName.should.equal('F01');
        });
      });
    });
  });
});
