const _ = require('lodash');
require('chai').should();

const testUtils = require('./utils');
const { buildFilter } = require('../dist');
const { expect } = require('chai');

const isSorted = (array, isDescending = false) => {
  const sortedVals = _.cloneDeep(array).sort((a, b) =>
    isDescending ? b - a : a - b,
  );
  return _.isEqual(array, sortedVals);
};
describe('JSONB attributes', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
    if (knexConfig.client !== 'postgres') return;
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

      describe('JSONB filtering', function () {
        it('should work with simple string equality', async () => {
          const result = await buildFilter(Movie).build({
            where: {
              metadata$stringField: 'M99',
            },
          });
          result.should.be.an.an('array');
          result.should.have.length(1);
        });
        it('should work with numeric equality', async () => {
          const result = await buildFilter(Movie).build({
            where: {
              metadata$numberField: 1,
            },
          });
          result.should.be.an.an('array');
          result.should.have.length(10);
        });
        it('should work with logical operators', async () => {
          const result = await buildFilter(Movie).build({
            where: {
              metadata$stringField: {
                or: [{ equals: 'M99' }, { equals: 'M98' }],
              },
            },
          });
          result.should.be.an.an('array');
          result.should.have.length(2);
        });
        it('should work with math operators', async () => {
          const result = await buildFilter(Movie).build({
            where: {
              metadata$numberField: {
                and: [{ gte: 2 }, { lt: 4 }],
              },
            },
          });
          result.should.be.an.an('array');
          result.should.have.length(20);
        });
        it('should work nested object properties', async () => {
          const result = await buildFilter(Movie).build({
            where: {
              'metadata$objectField.numberField': 1,
            },
          });
          result.should.be.an.an('array');
          result.should.have.length(10);
        });
        it('should support array indexing', async () => {
          const result = await buildFilter(Movie).build({
            where: {
              'metadata$arrayField[0]': 1,
            },
          });
          result.should.be.an.an('array');
          result.should.have.length(50);
        });
        it('should support boolean types', async () => {
          const result = await buildFilter(Movie).build({
            where: {
              metadata$booleanField: false,
            },
          });
          result.length.should.be.greaterThan(0);
          for (const row of result) {
            row.metadata.booleanField.should.equal(false);
          }
        });
        it('should order by a string property value', async () => {
          const result = await buildFilter(Movie).build({
            order: 'metadata$stringField asc',
          });
          result.should.be.an.an('array');
          const resultVals = result.map((movie) => movie.metadata.stringField);
          expect(isSorted(resultVals)).to.be.true;
        });
        it('should order by a number property value', async () => {
          const result = await buildFilter(Movie).build({
            order: 'metadata$numberField asc',
          });
          result.should.be.an.an('array');
          const resultVals = result.map((movie) => movie.metadata.numberField);
          expect(isSorted(resultVals)).to.be.true;
        });
        it('should order by a boolean property value', async () => {
          const result = await buildFilter(Movie).build({
            order: 'metadata$booleanField asc',
          });
          result.should.be.an.an('array');
          const resultVals = result.map(
            (movie) => movie.metadata.booleanField,
          );
          expect(isSorted(resultVals)).to.be.true;
        });
        it('should order by a nested property value', async () => {
          const result = await buildFilter(Movie).build({
            order: 'metadata$objectField.numberField asc',
          });
          result.should.be.an.an('array');
          const resultVals = result.map(
            (movie) => movie.metadata.objectField.numberField,
          );
          expect(isSorted(resultVals)).to.be.true;
        });
        it('should order by a array index value', async () => {
          const result = await buildFilter(Movie).build({
            order: 'metadata$arrayField[0] asc',
          });
          result.should.be.an.an('array');
          const resultVals = result.map(
            (movie) => movie.metadata.arrayField[0],
          );
          expect(isSorted(resultVals)).to.be.true;
        });
        it('should order by property value descending', async () => {
          const result = await buildFilter(Movie).build({
            order: 'metadata$numberField desc',
          });
          result.should.be.an.an('array');
          const resultVals = result.map((movie) => movie.metadata.numberField);
          expect(isSorted(resultVals, true)).to.be.true;
        });
      });
    });
  });
});
