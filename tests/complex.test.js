const _ = require('lodash');
require('chai').should();
const { expect } = require('chai');

const testUtils = require('./utils');
const { buildFilter } = require('../dist');

describe('complex filters', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
    describe(knexConfig.client, function () {
      let session, Person, Animal, Movie;

      before(function () {
        session = testUtils.initialize(knexConfig);
        Person = session.models.Person;
        Animal = session.models.Animal;
        Movie = session.models.Movie;
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

      describe('edge cases', function () {
        it('should do nothing with no expression', async () => {
          const result = await buildFilter(Person).build();
          result.length.should.equal(10);
          result
            .map((item) => item.firstName)
            .should.deep.equal([
              'F00',
              'F01',
              'F02',
              'F03',
              'F04',
              'F05',
              'F06',
              'F07',
              'F08',
              'F09',
            ]);
        });

        it('should be equivalent if require/where on a root model column', async () => {
          const result1 = await buildFilter(Person).build({
            require: {
              firstName: 'F01',
            },
          });

          const result2 = await buildFilter(Person).build({
            where: {
              firstName: 'F01',
            },
          });
          result1.should.deep.equal(result2);
        });

        it('should not cause name collisions when only joining belongsTo relations', async () => {
          const query = buildFilter(Movie, null);
          const movie = await query.first({
            where: {
              and: {
                'name': 'M12',
                'category.name': 'C08',
              },
            }
          });

          expect(movie.name).to.equal('M12');
          expect(movie.code).to.equal('C08');
        });

        // it('should pass the builder context to relation modifiers', async () => {
        //   // Make a builder with a context to be used in the relation
        //   const builder = Person.query();
        //   builder.context({ useFirstMovie: () => true });

        //   const query = buildFilter(Person, null, { builder });
        //   const result = await query.build({
        //     where: {
        //       'movies.categoryId': 1,
        //     }
        //   });

        //   expect(results.length).to.equal(1);
        //   const person = results[0];
        //   // expect(person.movies.length).to.equal(1);
        //   // const movie = person.movies[0];
        //   // expect(movie.name).to.equal('M90');
        // });

        context(
          'given there are or conditions on root and related models (belongsTo)',
          () => {
            let result;

            before(async () => {
              // Create a new Animal without an ownerId data (so inner join would omit this row normally)
              await Animal.query().insert({ id: 1000, name: 'PXX' });

              const query = buildFilter(Animal, null);
              result = (
                await query.build({
                  where: {
                    or: [{ name: 'PXX' }, { 'owner.firstName': 'F00' }],
                  },
                })
              );
            });

            after(async () => {
              await Animal.query().delete().where({ name: 'PXX' });
            });

            it('should return 11 rows', () => {
              result.length.should.equal(11);
            });

            it('should return the correct data', () => {
              result
                .map((animal) => animal.name)
                .sort()
                .should.deep.equal([
                  'P00',
                  'P01',
                  'P02',
                  'P03',
                  'P04',
                  'P05',
                  'P06',
                  'P07',
                  'P08',
                  'P09',
                  'PXX',
                ]);
            });
          },
        );

        context(
          'given there are or conditions on root and related models (hasMany)',
          () => {
            let result;

            before(async () => {
              // Create a new Person without related data (so inner join would omit this row normally)
              await Person.query().insert({ id: 1000, firstName: 'FXX' });

              const query = buildFilter(Person, null);
              result = (
                await query.build({
                  where: {
                    or: [{ firstName: 'FXX' }, { 'pets.name': 'P00' }],
                  },
                })
              );
            });

            after(async () => {
              await Person.query().delete().where({ firstName: 'FXX' });
            });

            it('should return 2 rows', () => {
              result.length.should.equal(2);
            });

            it('should return the correct data', () => {
              result
                .map((person) => person.firstName)
                .sort()
                .should.deep.equal(['F00', 'FXX']);
            });
          },
        );
      });
      describe('edge cases paginated', function () {
        it('should do nothing with no expression', async () => {
          const { results } = await buildFilter(Person).paginated();
          results.length.should.equal(10);
          results
            .map((item) => item.firstName)
            .should.deep.equal([
              'F00',
              'F01',
              'F02',
              'F03',
              'F04',
              'F05',
              'F06',
              'F07',
              'F08',
              'F09',
            ]);
        });

        it('should be equivalent if require/where on a root model column', async () => {
          const { results: results1 } = await buildFilter(Person).paginated({
            require: {
              firstName: 'F01',
            },
          });

          const { results: results2 } = await buildFilter(Person).paginated({
            where: {
              firstName: 'F01',
            },
          });
          results1.should.deep.equal(results2);
        });

        it('should not cause name collisions when only joining belongsTo relations', async () => {
          const query = buildFilter(Movie, null);
          const { results, ...t } = await query.paginated({
            where: {
              and: {
                'name': 'M12',
                'category.name': 'C08',
              },
            }
          });

          const movie = results[0];

          expect(movie.name).to.equal('M12');
          expect(movie.code).to.equal('C08');
        });

        // it('should pass the builder context to relation modifiers', async () => {
        //   // Make a builder with a context to be used in the relation
        //   const builder = Person.query();
        //   builder.context({ useFirstMovie: () => true });

        //   const query = buildFilter(Person, null, { builder });
        //   const { results } = await query.paginated({
        //     where: {
        //       'movies.categoryId': 1,
        //     }
        //   });

        //   expect(results.length).to.equal(1);
        //   const person = results[0];
        //   // expect(person.movies.length).to.equal(1);
        //   // const movie = person.movies[0];
        //   // expect(movie.name).to.equal('M90');
        // });

        context(
          'given there are or conditions on root and related models (belongsTo)',
          () => {
            let result;

            before(async () => {
              // Create a new Animal without an ownerId data (so inner join would omit this row normally)
              await Animal.query().insert({ id: 1000, name: 'PXX' });

              const query = buildFilter(Animal, null);
              result = (
                await query.paginated({
                  where: {
                    or: [{ name: 'PXX' }, { 'owner.firstName': 'F00' }],
                  },
                })
              ).results;
            });

            after(async () => {
              await Animal.query().delete().where({ name: 'PXX' });
            });

            it('should return 11 rows', () => {
              result.length.should.equal(11);
            });

            it('should return the correct data', () => {
              result
                .map((animal) => animal.name)
                .sort()
                .should.deep.equal([
                  'P00',
                  'P01',
                  'P02',
                  'P03',
                  'P04',
                  'P05',
                  'P06',
                  'P07',
                  'P08',
                  'P09',
                  'PXX',
                ]);
            });
          },
        );

        context(
          'given there are or conditions on root and related models (hasMany)',
          () => {
            let result;

            before(async () => {
              // Create a new Person without related data (so inner join would omit this row normally)
              await Person.query().insert({ id: 1000, firstName: 'FXX' });

              const query = buildFilter(Person, null);
              result = (
                await query.paginated({
                  where: {
                    or: [{ firstName: 'FXX' }, { 'pets.name': 'P00' }],
                  },
                })
              ).results;
            });

            after(async () => {
              await Person.query().delete().where({ firstName: 'FXX' });
            });

            it('should return 2 rows', () => {
              result.length.should.equal(2);
            });

            it('should return the correct data', () => {
              result
                .map((person) => person.firstName)
                .sort()
                .should.deep.equal(['F00', 'FXX']);
            });
          },
        );
      });

      describe('comparative operators', function () {
        it('should search related model using lte', async () => {
          const { results } = await buildFilter(Person).paginated({
            require: {
              'movies.id': {
                lte: 3,
              },
            },
          });
          results.length.should.equal(1);
          const person = results[0];
          person.firstName.should.equal('F00');
        });

        it('should search related model using exists', async () => {
          const result = await buildFilter(Person).build({
            require: {
              'movies.code': {
                exists: true,
              },
            },
            order: 'firstName',
          });
          result.length.should.equal(5);
          result
            .map((item) => item.firstName)
            .should.deep.equal(['F05', 'F06', 'F07', 'F08', 'F09']);
        });

        it('should search related model using !exists', async () => {
          const result = await buildFilter(Person).build({
            require: {
              'movies.code': {
                exists: false,
              },
            },
            order: 'firstName',
          });
          result.length.should.equal(5);
          result
            .map((item) => item.firstName)
            .should.deep.equal(['F00', 'F01', 'F02', 'F03', 'F04']);
        });
      });
    });
  });
});
